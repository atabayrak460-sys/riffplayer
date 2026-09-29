import 'dart:io';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';
import 'package:dio/dio.dart';
import '../api/types.dart';
import '../api/subsonic.dart';

typedef DownloadProgress = void Function(int received, int total);

// Constructed exactly once via downloadServiceProvider (a plain Riverpod
// Provider, so effectively a singleton for the app's lifetime) — state lives
// on the instance rather than as static fields so nothing else can assume
// (or accidentally rely on) every DownloadService sharing one global state.
class DownloadService {
  Database? _db;
  final Map<String, CancelToken> _activeDownloads = {};

  // ── Database ────────────────────────────────────────────────────────────────

  Future<Database> get _database async {
    if (_db != null) return _db!;
    final dbPath = p.join(await getDatabasesPath(), 'cadence_downloads.db');
    _db = await openDatabase(
      dbPath,
      version: 2,
      onCreate: (db, _) => db.execute('''
        CREATE TABLE downloads (
          track_id   TEXT PRIMARY KEY,
          local_path TEXT NOT NULL,
          title      TEXT NOT NULL,
          artist     TEXT NOT NULL,
          album      TEXT NOT NULL,
          cover_art_id TEXT,
          cover_local_path TEXT,
          file_size  INTEGER,
          downloaded_at INTEGER NOT NULL
        )
      '''),
      onUpgrade: (db, oldVersion, newVersion) async {
        if (oldVersion < 2) {
          await db.execute(
              'ALTER TABLE downloads ADD COLUMN cover_local_path TEXT');
        }
      },
    );
    return _db!;
  }

  // ── Query ───────────────────────────────────────────────────────────────────

  Future<List<DownloadedTrack>> getDownloads() async {
    final db = await _database;
    final rows = await db.query('downloads', orderBy: 'downloaded_at DESC');
    return rows.map(_rowToTrack).toList();
  }

  Future<String?> localPath(String trackId) async {
    final db = await _database;
    final rows = await db.query('downloads',
        columns: ['local_path'], where: 'track_id = ?', whereArgs: [trackId]);
    if (rows.isEmpty) return null;
    final path = rows.first['local_path'] as String;
    return File(path).existsSync() ? path : null;
  }

  /// The locally-saved cover art for a downloaded track, if it has one and
  /// the fetch succeeded — used for offline display (Downloads screen,
  /// lock-screen/notification artwork) instead of a live network fetch.
  Future<String?> localCoverPath(String trackId) async {
    final db = await _database;
    final rows = await db.query('downloads',
        columns: ['cover_local_path'],
        where: 'track_id = ?',
        whereArgs: [trackId]);
    if (rows.isEmpty) return null;
    final path = rows.first['cover_local_path'] as String?;
    if (path == null) return null;
    return File(path).existsSync() ? path : null;
  }

  Future<bool> isDownloaded(String trackId) async =>
      (await localPath(trackId)) != null;

  // ── Download ─────────────────────────────────────────────────────────────────

  Future<void> download(
    Song song,
    SubsonicClient client, {
    DownloadProgress? onProgress,
  }) async {
    if (_activeDownloads.containsKey(song.id)) return; // already in progress

    final dir = await _downloadsDir();
    final savePath = p.join(dir, '${song.id}.${song.suffix}');
    final cancelToken = CancelToken();
    _activeDownloads[song.id] = cancelToken;

    try {
      await client.downloadTrack(
        song.id,
        savePath,
        onProgress: (received, total) => onProgress?.call(received, total),
        cancelToken: cancelToken,
      );
      final fileSize = File(savePath).lengthSync();
      final coverPath = await _downloadCoverArt(song, client, cancelToken);
      await _saveRecord(song, savePath, fileSize, coverPath);
    } catch (e) {
      // Clean up partial file
      final f = File(savePath);
      if (f.existsSync()) f.deleteSync();
      rethrow;
    } finally {
      _activeDownloads.remove(song.id);
    }
  }

  Future<void> cancelDownload(String trackId) async {
    _activeDownloads[trackId]?.cancel('User cancelled');
    _activeDownloads.remove(trackId);
  }

  Future<void> deleteDownload(String trackId) async {
    final db = await _database;
    final rows = await db.query('downloads',
        columns: ['local_path', 'cover_local_path'],
        where: 'track_id = ?',
        whereArgs: [trackId]);
    if (rows.isNotEmpty) {
      final path = rows.first['local_path'] as String;
      final f = File(path);
      if (f.existsSync()) f.deleteSync();
      final coverPath = rows.first['cover_local_path'] as String?;
      if (coverPath != null) {
        final cf = File(coverPath);
        if (cf.existsSync()) cf.deleteSync();
      }
    }
    await db.delete('downloads', where: 'track_id = ?', whereArgs: [trackId]);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  Future<String> _downloadsDir() async {
    final base = await getApplicationDocumentsDirectory();
    final dir = Directory(p.join(base.path, 'downloads'));
    if (!dir.existsSync()) dir.createSync(recursive: true);
    return dir.path;
  }

  Future<String> _coversDir() async {
    final base = await getApplicationDocumentsDirectory();
    final dir = Directory(p.join(base.path, 'downloads', 'covers'));
    if (!dir.existsSync()) dir.createSync(recursive: true);
    return dir.path;
  }

  /// Best-effort — a failed or missing cover shouldn't fail the track
  /// download itself, so any error *other* than the download being
  /// cancelled is swallowed here rather than propagated to [download]'s
  /// `catch`. A genuine cancellation is rethrown so that handler still
  /// cleans up the partial track file and reports the cancellation, instead
  /// of this silently completing the download as "successful, no cover".
  Future<String?> _downloadCoverArt(
    Song song,
    SubsonicClient client,
    CancelToken cancelToken,
  ) async {
    if (song.coverArt == null) return null;
    try {
      final dir = await _coversDir();
      final path = p.join(dir, '${song.id}.jpg');
      await client.downloadCoverArt(song.coverArt!, path,
          size: 600, cancelToken: cancelToken);
      return path;
    } catch (e) {
      if (cancelToken.isCancelled) rethrow;
      return null;
    }
  }

  Future<void> _saveRecord(
    Song song,
    String path,
    int fileSize,
    String? coverPath,
  ) async {
    final db = await _database;
    await db.insert(
      'downloads',
      {
        'track_id': song.id,
        'local_path': path,
        'title': song.title,
        'artist': song.artist,
        'album': song.album,
        'cover_art_id': song.coverArt,
        'cover_local_path': coverPath,
        'file_size': fileSize,
        'downloaded_at': DateTime.now().millisecondsSinceEpoch,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  DownloadedTrack _rowToTrack(Map<String, dynamic> row) => DownloadedTrack(
        trackId: row['track_id'] as String,
        localPath: row['local_path'] as String,
        title: row['title'] as String,
        artist: row['artist'] as String,
        album: row['album'] as String,
        coverArtId: row['cover_art_id'] as String?,
        coverLocalPath: row['cover_local_path'] as String?,
        fileSize: row['file_size'] as int?,
        downloadedAt:
            DateTime.fromMillisecondsSinceEpoch(row['downloaded_at'] as int),
      );
}
