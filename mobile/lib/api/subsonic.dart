import 'dart:convert';
import 'dart:math';
import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'types.dart';

class SubsonicClient {
  final Credentials credentials;
  final Dio _dio;

  SubsonicClient(this.credentials)
      : _dio = Dio(BaseOptions(
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 30),
        ));

  // ── Auth helpers ────────────────────────────────────────────────────────────

  static String _randomSalt() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    final rng = Random.secure();
    return List.generate(8, (_) => chars[rng.nextInt(chars.length)]).join();
  }

  static String _computeToken(String password, String salt) {
    final bytes = utf8.encode('$password$salt');
    return md5.convert(bytes).toString();
  }

  Map<String, String> _authParams() {
    final salt = _randomSalt();
    return {
      'u': credentials.username,
      't': _computeToken(credentials.password, salt),
      's': salt,
      'v': '1.16.1',
      'c': 'cadence-flutter',
      'f': 'json',
    };
  }

  String _url(String endpoint) =>
      '${credentials.serverUrl}/rest/$endpoint';

  // ── Media URL builders (used as audio/image src) ────────────────────────────

  String streamUrl(String trackId) {
    final params = {..._authParams(), 'id': trackId};
    final query =
        params.entries.map((e) => '${e.key}=${Uri.encodeComponent(e.value)}').join('&');
    return '${_url('stream.view')}?$query';
  }

  String coverArtUrl(String id, {int? size}) {
    final params = {..._authParams(), 'id': id};
    if (size != null) params['size'] = size.toString();
    final query =
        params.entries.map((e) => '${e.key}=${Uri.encodeComponent(e.value)}').join('&');
    return '${_url('getCoverArt.view')}?$query';
  }

  // ── Core GET wrapper ────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> _get(
    String endpoint, [
    Map<String, String> extra = const {},
  ]) async {
    final params = {..._authParams(), ...extra};
    final response = await _dio.get<Map<String, dynamic>>(
      _url(endpoint),
      queryParameters: params,
    );
    final body = response.data!;
    final sr = body['subsonic-response'] as Map<String, dynamic>;
    if (sr['status'] != 'ok') {
      final err = sr['error'] as Map<String, dynamic>?;
      throw Exception(err?['message'] ?? 'Subsonic error');
    }
    return sr;
  }

  // ── Custom API login (returns JWT, null if unavailable) ─────────────────────

  Future<String?> loginCustomApi(String username, String password) async {
    try {
      final r = await _dio.post<Map<String, dynamic>>(
        '${credentials.serverUrl}/api/v1/auth/login',
        data: {'username': username, 'password': password},
      );
      return r.data?['token'] as String?;
    } catch (_) {
      return null;
    }
  }

  // ── Ping ────────────────────────────────────────────────────────────────────

  Future<void> ping() => _get('ping.view');

  // ── Browse ──────────────────────────────────────────────────────────────────

  Future<List<ArtistIndex>> getArtists() async {
    final r = await _get('getArtists.view');
    final indexes = r['artists']['index'] as List<dynamic>? ?? [];
    return indexes
        .map((i) => ArtistIndex.fromJson(i as Map<String, dynamic>))
        .toList();
  }

  Future<Artist> getArtist(String id) async {
    final r = await _get('getArtist.view', {'id': id});
    final a = r['artist'] as Map<String, dynamic>;
    final albums = (a['album'] as List<dynamic>? ?? [])
        .map((al) => Album.fromJson(al as Map<String, dynamic>))
        .toList();
    return Artist.fromJson({...a, 'albumCount': albums.length});
  }

  Future<({Artist artist, List<Album> albums})> getArtistDetail(String id) async {
    final r = await _get('getArtist.view', {'id': id});
    final a = r['artist'] as Map<String, dynamic>;
    final albums = (a['album'] as List<dynamic>? ?? [])
        .map((al) => Album.fromJson(al as Map<String, dynamic>))
        .toList();
    return (artist: Artist.fromJson(a), albums: albums);
  }

  Future<List<Album>> getAlbumList(String type, {int size = 50, int offset = 0}) async {
    final r = await _get('getAlbumList2.view', {
      'type': type,
      'size': size.toString(),
      'offset': offset.toString(),
    });
    final list = (r['albumList2']?['album'] as List<dynamic>?) ?? [];
    return list.map((a) => Album.fromJson(a as Map<String, dynamic>)).toList();
  }

  Future<({Album album, List<Song> songs})> getAlbum(String id) async {
    final r = await _get('getAlbum.view', {'id': id});
    final a = r['album'] as Map<String, dynamic>;
    final songs = (a['song'] as List<dynamic>? ?? [])
        .map((s) => Song.fromJson(s as Map<String, dynamic>))
        .toList();
    return (album: Album.fromJson(a), songs: songs);
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  Future<SearchResult> search(String query) async {
    final r = await _get('search3.view', {
      'query': query,
      'artistCount': '10',
      'albumCount': '20',
      'songCount': '30',
    });
    final sr3 = r['searchResult3'] as Map<String, dynamic>? ?? {};
    return SearchResult(
      artists: (sr3['artist'] as List<dynamic>? ?? [])
          .map((a) => Artist.fromJson(a as Map<String, dynamic>))
          .toList(),
      albums: (sr3['album'] as List<dynamic>? ?? [])
          .map((a) => Album.fromJson(a as Map<String, dynamic>))
          .toList(),
      songs: (sr3['song'] as List<dynamic>? ?? [])
          .map((s) => Song.fromJson(s as Map<String, dynamic>))
          .toList(),
    );
  }

  // ── Favourites ──────────────────────────────────────────────────────────────

  Future<({List<Artist> artists, List<Album> albums, List<Song> songs})>
      getStarred() async {
    final r = await _get('getStarred2.view');
    final s2 = r['starred2'] as Map<String, dynamic>? ?? {};
    return (
      artists: (s2['artist'] as List<dynamic>? ?? [])
          .map((a) => Artist.fromJson(a as Map<String, dynamic>))
          .toList(),
      albums: (s2['album'] as List<dynamic>? ?? [])
          .map((a) => Album.fromJson(a as Map<String, dynamic>))
          .toList(),
      songs: (s2['song'] as List<dynamic>? ?? [])
          .map((s) => Song.fromJson(s as Map<String, dynamic>))
          .toList(),
    );
  }

  Future<void> star({String? id, String? albumId, String? artistId}) => _get('star.view', {
        if (id != null) 'id': id,
        if (albumId != null) 'albumId': albumId,
        if (artistId != null) 'artistId': artistId,
      });

  Future<void> unstar({String? id, String? albumId, String? artistId}) => _get('unstar.view', {
        if (id != null) 'id': id,
        if (albumId != null) 'albumId': albumId,
        if (artistId != null) 'artistId': artistId,
      });

  // ── Playlists ───────────────────────────────────────────────────────────────

  Future<List<Playlist>> getPlaylists() async {
    final r = await _get('getPlaylists.view');
    final list = (r['playlists']?['playlist'] as List<dynamic>?) ?? [];
    return list.map((p) => Playlist.fromJson(p as Map<String, dynamic>)).toList();
  }

  Future<Playlist> getPlaylist(String id) async {
    final r = await _get('getPlaylist.view', {'id': id});
    return Playlist.fromJson(r['playlist'] as Map<String, dynamic>);
  }

  Future<void> createPlaylist(String name) =>
      _get('createPlaylist.view', {'name': name});

  Future<void> deletePlaylist(String id) =>
      _get('deletePlaylist.view', {'id': id});

  // ── Scrobble ─────────────────────────────────────────────────────────────────

  Future<void> scrobble(String id, {bool submission = true}) => _get('scrobble.view', {
        'id': id,
        'submission': submission.toString(),
      });

  // ── Download (with progress) ─────────────────────────────────────────────────

  Future<void> downloadTrack(
    String trackId,
    String savePath, {
    ProgressCallback? onProgress,
    CancelToken? cancelToken,
  }) async {
    final params = {..._authParams(), 'id': trackId};
    await _dio.download(
      _url('download.view'),
      savePath,
      queryParameters: params,
      onReceiveProgress: onProgress,
      cancelToken: cancelToken,
    );
  }
}
