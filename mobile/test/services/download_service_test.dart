import 'dart:io';

import 'package:cadence_mobile/services/download_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

// DownloadService has no public write method that doesn't also require a
// real network download (SubsonicClient.downloadTrack), so rows are seeded
// here by opening a second handle onto the same sqflite_common_ffi-backed
// database file and inserting directly — `service.getDownloads()` is called
// first to make sure the table has actually been created.
Future<File> _seedRow(
  DownloadService service,
  Directory tempDir, {
  required String trackId,
  required bool fileExists,
  DateTime? downloadedAt,
  String? coverLocalPath,
}) async {
  await service.getDownloads();

  final dbPath = p.join(await getDatabasesPath(), 'cadence_downloads.db');
  final db = await databaseFactory.openDatabase(dbPath);

  final file = File(p.join(tempDir.path, '$trackId.mp3'));
  if (fileExists) file.writeAsBytesSync([1, 2, 3]);

  await db.insert('downloads', {
    'track_id': trackId,
    'local_path': file.path,
    'title': 'Title $trackId',
    'artist': 'Artist',
    'album': 'Album',
    'cover_art_id': null,
    'cover_local_path': coverLocalPath,
    'file_size': 123,
    'downloaded_at': (downloadedAt ?? DateTime.now()).millisecondsSinceEpoch,
  });

  return file;
}

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  late DownloadService service;
  late Directory tempDir;

  setUp(() async {
    // A fresh table for every test — DownloadService always resolves to the
    // same fixed filename under getDatabasesPath(), so a leftover file from
    // a previous test would otherwise leak rows across test cases.
    final dbPath = p.join(await getDatabasesPath(), 'cadence_downloads.db');
    await databaseFactory.deleteDatabase(dbPath);
    service = DownloadService();
    tempDir = await Directory.systemTemp.createTemp('cadence_dl_test_');
  });

  tearDown(() {
    if (tempDir.existsSync()) tempDir.deleteSync(recursive: true);
  });

  group('getDownloads / localPath / isDownloaded', () {
    test('nothing downloaded yet', () async {
      expect(await service.getDownloads(), isEmpty);
      expect(await service.localPath('missing'), isNull);
      expect(await service.isDownloaded('missing'), isFalse);
    });

    test('finds a downloaded track whose file still exists on disk', () async {
      final file =
          await _seedRow(service, tempDir, trackId: 't1', fileExists: true);

      expect(await service.localPath('t1'), file.path);
      expect(await service.isDownloaded('t1'), isTrue);

      final downloads = await service.getDownloads();
      expect(downloads, hasLength(1));
      expect(downloads.single.trackId, 't1');
      expect(downloads.single.title, 'Title t1');
    });

    test('treats a downloaded track as missing once its file is gone',
        () async {
      await _seedRow(service, tempDir, trackId: 't1', fileExists: false);

      expect(await service.localPath('t1'), isNull);
      expect(await service.isDownloaded('t1'), isFalse);
    });

    test('orders results newest download first', () async {
      await _seedRow(service, tempDir,
          trackId: 'old', fileExists: true, downloadedAt: DateTime(2020));
      await _seedRow(service, tempDir,
          trackId: 'new', fileExists: true, downloadedAt: DateTime(2024));

      final downloads = await service.getDownloads();
      expect(downloads.map((d) => d.trackId), ['new', 'old']);
    });
  });

  group('deleteDownload', () {
    test('removes both the row and the file on disk', () async {
      final file =
          await _seedRow(service, tempDir, trackId: 't1', fileExists: true);

      await service.deleteDownload('t1');

      expect(await service.localPath('t1'), isNull);
      expect(file.existsSync(), isFalse);
    });

    test('is a no-op for a track that was never downloaded', () async {
      await service.deleteDownload('missing');
      expect(await service.getDownloads(), isEmpty);
    });

    test('also removes the cover art file on disk, when there is one',
        () async {
      final coverFile = File(p.join(tempDir.path, 't1_cover.jpg'))
        ..writeAsBytesSync([1, 2, 3]);
      await _seedRow(service, tempDir,
          trackId: 't1', fileExists: true, coverLocalPath: coverFile.path);

      await service.deleteDownload('t1');

      expect(coverFile.existsSync(), isFalse);
    });

    test('does not crash when a track has no cover art file', () async {
      await _seedRow(service, tempDir, trackId: 't1', fileExists: true);
      await service.deleteDownload('t1');
      expect(await service.getDownloads(), isEmpty);
    });
  });

  group('localCoverPath', () {
    test('null for a track with no downloaded cover', () async {
      await _seedRow(service, tempDir, trackId: 't1', fileExists: true);
      expect(await service.localCoverPath('t1'), isNull);
    });

    test('null for a missing track entirely', () async {
      expect(await service.localCoverPath('missing'), isNull);
    });

    test('returns the path when the cover file exists on disk', () async {
      final coverFile = File(p.join(tempDir.path, 't1_cover.jpg'))
        ..writeAsBytesSync([1, 2, 3]);
      await _seedRow(service, tempDir,
          trackId: 't1', fileExists: true, coverLocalPath: coverFile.path);

      expect(await service.localCoverPath('t1'), coverFile.path);
    });

    test('null once the cover file on disk has been removed', () async {
      final coverFile = File(p.join(tempDir.path, 't1_cover.jpg'));
      // Note: not writing the file — same "row references a path, but the
      // file at it is gone" case localPath() already guards against.
      await _seedRow(service, tempDir,
          trackId: 't1', fileExists: true, coverLocalPath: coverFile.path);

      expect(await service.localCoverPath('t1'), isNull);
    });
  });

  // Regression coverage for the downloads table schema migration (v1 -> v2,
  // adding cover_local_path): a real device with tracks already downloaded
  // under the old schema must not lose them, or crash, on first launch
  // after the update.
  group('schema migration', () {
    test(
        'upgrading from the pre-cover-art schema (v1) preserves existing '
        'rows and makes cover_local_path usable', () async {
      final dbPath = p.join(await getDatabasesPath(), 'cadence_downloads.db');
      final v1Db = await databaseFactory.openDatabase(
        dbPath,
        options: OpenDatabaseOptions(
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
        ),
      );
      final file = File(p.join(tempDir.path, 'old.mp3'))
        ..writeAsBytesSync([1, 2, 3]);
      await v1Db.insert('downloads', {
        'track_id': 'old',
        'local_path': file.path,
        'title': 'Pre-migration track',
        'artist': 'Artist',
        'album': 'Album',
        'cover_art_id': null,
        'file_size': 3,
        'downloaded_at': DateTime.now().millisecondsSinceEpoch,
      });
      await v1Db.close();

      // DownloadService opens at version 2 — triggers onUpgrade.
      final downloads = await service.getDownloads();

      expect(downloads, hasLength(1));
      expect(downloads.single.trackId, 'old');
      expect(downloads.single.title, 'Pre-migration track');
      expect(downloads.single.coverLocalPath, isNull);
      // The new column must be genuinely queryable now, not just absent
      // from the migrated row by coincidence.
      expect(await service.localCoverPath('old'), isNull);
    });
  });
}
