// A fake Dio transport shared by the API client tests: record what was requested, answer with canned JSON.
import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';

class FakeAdapter implements HttpClientAdapter {
  final List<RequestOptions> requests = [];
  ResponseBody Function(RequestOptions) responder = (_) => json(200, {});

  RequestOptions get last => requests.last;

  @override
  Future<ResponseBody> fetch(RequestOptions options,
      Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    requests.add(options);
    return responder(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody json(int status, Object body) => ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

/// A Subsonic-style envelope: {"subsonic-response": {"status": "ok", ...extra}}.
ResponseBody subsonic(Map<String, Object?> extra, {String status = 'ok'}) =>
    json(200, {
      'subsonic-response': {'status': status, ...extra},
    });
