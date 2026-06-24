class Credentials {
  final String serverUrl;
  final String username;
  final String password;
  final String? token; // JWT for /api/v1

  const Credentials({
    required this.serverUrl,
    required this.username,
    required this.password,
    this.token,
  });

  Credentials copyWith({String? token}) => Credentials(
        serverUrl: serverUrl,
        username: username,
        password: password,
        token: token ?? this.token,
      );
}

class Artist {
  final String id;
  final String name;
  final int albumCount;
  final String? coverArt;
  final String? starred;

  const Artist({
    required this.id,
    required this.name,
    required this.albumCount,
    this.coverArt,
    this.starred,
  });

  factory Artist.fromJson(Map<String, dynamic> j) => Artist(
        id: j['id'] as String,
        name: j['name'] as String,
        albumCount: (j['albumCount'] as num?)?.toInt() ?? 0,
        coverArt: j['coverArt'] as String?,
        starred: j['starred'] as String?,
      );

  bool get isStarred => starred != null;
}

class ArtistIndex {
  final String name;
  final List<Artist> artists;

  const ArtistIndex({required this.name, required this.artists});

  factory ArtistIndex.fromJson(Map<String, dynamic> j) => ArtistIndex(
        name: j['name'] as String,
        artists: (j['artist'] as List<dynamic>? ?? [])
            .map((a) => Artist.fromJson(a as Map<String, dynamic>))
            .toList(),
      );
}

class Album {
  final String id;
  final String name;
  final String artist;
  final String artistId;
  final int? year;
  final String? coverArt;
  final int songCount;
  final int duration;
  final String? starred;

  const Album({
    required this.id,
    required this.name,
    required this.artist,
    required this.artistId,
    this.year,
    this.coverArt,
    required this.songCount,
    required this.duration,
    this.starred,
  });

  factory Album.fromJson(Map<String, dynamic> j) => Album(
        id: j['id'] as String,
        name: j['name'] as String,
        artist: j['artist'] as String? ?? '',
        artistId: j['artistId'] as String? ?? '',
        year: (j['year'] as num?)?.toInt(),
        coverArt: j['coverArt'] as String?,
        songCount: (j['songCount'] as num?)?.toInt() ?? 0,
        duration: (j['duration'] as num?)?.toInt() ?? 0,
        starred: j['starred'] as String?,
      );

  bool get isStarred => starred != null;
}

class Song {
  final String id;
  final String title;
  final String artist;
  final String artistId;
  final String album;
  final String albumId;
  final int? track;
  final int? discNumber;
  final int? year;
  final int? duration; // seconds
  final int? size;
  final String? coverArt;
  final String suffix;
  final String? starred;
  final double? replayGainTrackGain;

  const Song({
    required this.id,
    required this.title,
    required this.artist,
    required this.artistId,
    required this.album,
    required this.albumId,
    this.track,
    this.discNumber,
    this.year,
    this.duration,
    this.size,
    this.coverArt,
    required this.suffix,
    this.starred,
    this.replayGainTrackGain,
  });

  factory Song.fromJson(Map<String, dynamic> j) => Song(
        id: j['id'] as String,
        title: j['title'] as String,
        artist: j['artist'] as String? ?? '',
        artistId: j['artistId'] as String? ?? '',
        album: j['album'] as String? ?? '',
        albumId: j['albumId'] as String? ?? '',
        track: (j['track'] as num?)?.toInt(),
        discNumber: (j['discNumber'] as num?)?.toInt(),
        year: (j['year'] as num?)?.toInt(),
        duration: (j['duration'] as num?)?.toInt(),
        size: (j['size'] as num?)?.toInt(),
        coverArt: j['coverArt'] as String?,
        suffix: j['suffix'] as String? ?? 'mp3',
        starred: j['starred'] as String?,
        replayGainTrackGain:
            (j['replayGainTrackGain'] as num?)?.toDouble(),
      );

  bool get isStarred => starred != null;
}

class Playlist {
  final String id;
  final String name;
  final String owner;
  final int songCount;
  final int duration;
  final String? coverArt;
  final List<Song>? entries;

  const Playlist({
    required this.id,
    required this.name,
    required this.owner,
    required this.songCount,
    required this.duration,
    this.coverArt,
    this.entries,
  });

  factory Playlist.fromJson(Map<String, dynamic> j) => Playlist(
        id: j['id'] as String,
        name: j['name'] as String,
        owner: j['owner'] as String? ?? '',
        songCount: (j['songCount'] as num?)?.toInt() ?? 0,
        duration: (j['duration'] as num?)?.toInt() ?? 0,
        coverArt: j['coverArt'] as String?,
        entries: (j['entry'] as List<dynamic>?)
            ?.map((s) => Song.fromJson(s as Map<String, dynamic>))
            .toList(),
      );
}

class SearchResult {
  final List<Artist> artists;
  final List<Album> albums;
  final List<Song> songs;

  const SearchResult({
    required this.artists,
    required this.albums,
    required this.songs,
  });
}

class DownloadedTrack {
  final String trackId;
  final String localPath;
  final String title;
  final String artist;
  final String album;
  final String? coverArtId;
  final int? fileSize;
  final DateTime downloadedAt;

  const DownloadedTrack({
    required this.trackId,
    required this.localPath,
    required this.title,
    required this.artist,
    required this.album,
    this.coverArtId,
    this.fileSize,
    required this.downloadedAt,
  });
}
