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
  });
}
