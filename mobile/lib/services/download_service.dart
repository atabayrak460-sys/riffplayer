import 'dart:io';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';
import 'package:dio/dio.dart';
import '../api/types.dart';
import '../api/subsonic.dart';

typedef DownloadProgress = void Function(int received, int total);

class DownloadService {
  static Database? _db;
  static final Map<String, CancelToken> _activeDownloads = {};

  // ── Database ────────────────────────────────────────────────────────────────

  static Future<Database> get _database async {
    if (_db != null) return _db!;
    final dbPath = p.join(await getDatabasesPath(), 'cadence_downloads.db');
    _db = await openDatabase(
      dbPath,
      version: 1,
      onCreate: (db, _) => db.execute('''
        CREATE TABLE downloads (
          track_id   TEXT PRIMARY KEY,
          local_path TEXT NOT NULL,
          title      TEXT NOT NULL,
          artist     TEXT NOT NULL,
          album      TEXT NOT NULL,
          cover_art_id TEXT,
          file_size  INTEGER,
          downloaded_at INTEGER NOT NULL
        )
      '''),
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
      await _saveRecord(song, savePath, fileSize);
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
    final path = await localPath(trackId);
    if (path != null) {
      final f = File(path);
      if (f.existsSync()) f.deleteSync();
    }
    final db = await _database;
    await db.delete('downloads', where: 'track_id = ?', whereArgs: [trackId]);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  Future<String> _downloadsDir() async {
    final base = await getApplicationDocumentsDirectory();
    final dir = Directory(p.join(base.path, 'downloads'));
    if (!dir.existsSync()) dir.createSync(recursive: true);
    return dir.path;
  }

  Future<void> _saveRecord(Song song, String path, int fileSize) async {
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
        fileSize: row['file_size'] as int?,
        downloadedAt: DateTime.fromMillisecondsSinceEpoch(
            row['downloaded_at'] as int),
      );
}
