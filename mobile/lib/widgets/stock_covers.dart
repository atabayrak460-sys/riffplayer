import 'dart:ui' as ui;
import 'package:flutter/material.dart';

/// Stock cover art for views and playlists with no real artwork.
///
/// Ported from the web client's `StockCovers.tsx` — same shared style
/// language (dark diagonal gradient base, angular flat-gradient shapes, one
/// soft blurred glow), only the palette and shape motif differ per category.
/// Drawn with [CustomPainter] instead of SVG so no new asset-rendering
/// dependency is needed; coordinates are scaled from the web version's
/// 400×400 viewBox to whatever size is requested.

abstract class _StockCoverPainter extends CustomPainter {
  const _StockCoverPainter();

  List<Color> get bgGradient => const [Color(0xFF1C1A22), Color(0xFF08070A)];

  void paintShapes(Canvas canvas, double s);

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 400;
    canvas.save();
    canvas.scale(s);

    final bgPaint = Paint()
      ..shader = ui.Gradient.linear(
        const Offset(0, 0),
        const Offset(400, 400),
        bgGradient,
      );
    canvas.drawRect(const Rect.fromLTWH(0, 0, 400, 400), bgPaint);

    paintShapes(canvas, 1);

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

void _glow(Canvas canvas, Offset center, double radius, Color color, double opacity, double blur) {
  final paint = Paint()
    ..color = color.withValues(alpha: opacity)
    ..maskFilter = MaskFilter.blur(BlurStyle.normal, blur);
  canvas.drawCircle(center, radius, paint);
}

/// A linear-gradient fill with [opacity] baked into the gradient stops —
/// `Paint.shader` takes precedence over `Paint.color` during painting, so
/// opacity has to live in the shader's own colors, not a separate `.color`.
Paint _linearGrad(Offset from, Offset to, List<Color> colors, [double opacity = 1]) => Paint()
  ..shader = ui.Gradient.linear(
    from,
    to,
    colors.map((c) => c.withValues(alpha: opacity)).toList(),
  );

class _MostPlayedPainter extends _StockCoverPainter {
  const _MostPlayedPainter();
  @override
  void paintShapes(Canvas canvas, double s) {
    _glow(canvas, const Offset(300, 110), 95, const Color(0xFFF97316), 0.35, 30);
    const colors = [Color(0xFFFBBF24), Color(0xFFEF4444)];
    final line = Paint()
      ..color = const Color(0xFFFBBF24).withValues(alpha: 0.25)
      ..strokeWidth = 2;
    canvas.drawLine(const Offset(70, 345), const Offset(330, 345), line);
    void bar(List<Offset> pts, double opacity) {
      final path = Path()..addPolygon(pts, true);
      canvas.drawPath(path, _linearGrad(const Offset(0, 400), const Offset(400, 0), colors, opacity));
    }
    bar([const Offset(95, 345), const Offset(129, 345), const Offset(117, 265), const Offset(83, 265)], 0.75);
    bar([const Offset(150, 345), const Offset(184, 345), const Offset(172, 205), const Offset(138, 205)], 0.85);
    bar([const Offset(205, 345), const Offset(239, 345), const Offset(227, 140), const Offset(193, 140)], 0.95);
    bar([const Offset(260, 345), const Offset(294, 345), const Offset(282, 70), const Offset(248, 70)], 1);
  }
}

class _RecentlyPlayedPainter extends _StockCoverPainter {
  const _RecentlyPlayedPainter();
  @override
  void paintShapes(Canvas canvas, double s) {
    _glow(canvas, const Offset(200, 200), 120, const Color(0xFF38BDF8), 0.22, 40);
    const colors = [Color(0xFF38BDF8), Color(0xFF6366F1)];
    Paint arcPaint(double width, double opacity) =>
        _linearGrad(const Offset(0, 0), const Offset(400, 400), colors, opacity)
          ..style = PaintingStyle.stroke
          ..strokeWidth = width
          ..strokeCap = StrokeCap.round;
    canvas.drawArc(Rect.fromCircle(center: const Offset(200, 200), radius: 150), -1.35, 2.0, false,
        arcPaint(16, 0.65));
    canvas.drawArc(Rect.fromCircle(center: const Offset(200, 200), radius: 110), 2.6, 1.7, false,
        arcPaint(14, 0.85));
    canvas.drawArc(Rect.fromCircle(center: const Offset(200, 200), radius: 70), -2.9, 1.2, false,
        arcPaint(12, 1));
    canvas.drawCircle(const Offset(245, 146.4), 8, Paint()..color = const Color(0xFFA5B4FC));
  }
}

class _DownloadedPainter extends _StockCoverPainter {
  const _DownloadedPainter();
  @override
  void paintShapes(Canvas canvas, double s) {
    _glow(canvas, const Offset(200, 330), 110, const Color(0xFF10B981), 0.3, 35);
    const colors = [Color(0xFF2DD4BF), Color(0xFF059669)];
    void tri(List<Offset> pts, double opacity) {
      canvas.drawPath(Path()..addPolygon(pts, true),
          _linearGrad(const Offset(0, 0), const Offset(0, 400), colors, opacity));
    }
    tri([const Offset(160, 165), const Offset(240, 165), const Offset(200, 230)], 0.5);
    tri([const Offset(140, 230), const Offset(260, 230), const Offset(200, 300)], 0.75);
    tri([const Offset(120, 300), const Offset(280, 300), const Offset(200, 380)], 1);
  }
}

class _FavouritesPainter extends _StockCoverPainter {
  const _FavouritesPainter();
  @override
  void paintShapes(Canvas canvas, double s) {
    _glow(canvas, const Offset(200, 200), 130, const Color(0xFFFB7185), 0.22, 45);
    const colors = [Color(0xFFFB7185), Color(0xFFDB2777)];
    const opacities = [0.65, 0.85, 1.0, 0.85, 0.65];
    for (var i = 0; i < 5; i++) {
      canvas.save();
      canvas.translate(200, 200);
      canvas.rotate(i * 72 * 3.14159265 / 180);
      canvas.translate(-200, -200);
      final path = Path()
        ..addPolygon(const [
          Offset(200, 90),
          Offset(225, 175),
          Offset(200, 230),
          Offset(175, 175),
        ], true);
      canvas.drawPath(path,
          _linearGrad(const Offset(0, 0), const Offset(400, 400), colors, opacities[i]));
      canvas.restore();
    }
    canvas.drawCircle(const Offset(200, 200), 11, Paint()..color = const Color(0xFFFECDD3).withValues(alpha: 0.95));
  }
}

class _DiscoverPainter extends _StockCoverPainter {
  const _DiscoverPainter();
  @override
  void paintShapes(Canvas canvas, double s) {
    _glow(canvas, const Offset(140, 260), 100, const Color(0xFF22D3EE), 0.2, 38);
    _glow(canvas, const Offset(280, 120), 70, const Color(0xFFA78BFA), 0.2, 38);
    const colors = [Color(0xFFA78BFA), Color(0xFF22D3EE)];
    void tri(List<Offset> pts, double opacity) {
      canvas.drawPath(Path()..addPolygon(pts, true),
          _linearGrad(const Offset(0, 0), const Offset(400, 400), colors, opacity));
    }
    tri([const Offset(230, 150), const Offset(320, 190), const Offset(250, 260)], 1);
    tri([const Offset(120, 120), const Offset(175, 100), const Offset(190, 150), const Offset(135, 165)], 0.85);
    tri([const Offset(80, 230), const Offset(120, 215), const Offset(110, 260)], 0.7);
    tri([const Offset(300, 280), const Offset(340, 300), const Offset(305, 330)], 0.6);
    tri([const Offset(190, 320), const Offset(220, 310), const Offset(205, 345)], 0.5);
    canvas.drawCircle(const Offset(95, 170), 4, Paint()..color = const Color(0xFF22D3EE).withValues(alpha: 0.8));
    canvas.drawCircle(const Offset(330, 230), 4, Paint()..color = const Color(0xFFA78BFA).withValues(alpha: 0.8));
  }
}

class _WrappedPainter extends _StockCoverPainter {
  const _WrappedPainter();
  @override
  void paintShapes(Canvas canvas, double s) {
    _glow(canvas, const Offset(160, 300), 90, const Color(0xFFF472B6), 0.22, 40);
    _glow(canvas, const Offset(260, 290), 90, const Color(0xFFFB923C), 0.18, 40);
    const confetti = [
      (Offset(140, 330), 10.0, 26.0, Color(0xFFF472B6), 0.9),
      (Offset(200, 350), -15.0, 30.0, Color(0xFFA78BFA), 0.95),
      (Offset(260, 325), 20.0, 24.0, Color(0xFFFB923C), 0.9),
      (Offset(110, 270), 40.0, 20.0, Color(0xFFFB923C), 0.85),
      (Offset(180, 260), -25.0, 26.0, Color(0xFFF472B6), 0.85),
      (Offset(250, 250), 15.0, 22.0, Color(0xFFA78BFA), 0.9),
      (Offset(300, 270), -10.0, 18.0, Color(0xFFF472B6), 0.8),
      (Offset(150, 190), 30.0, 18.0, Color(0xFFA78BFA), 0.75),
      (Offset(230, 175), -20.0, 20.0, Color(0xFFFB923C), 0.75),
      (Offset(90, 200), 50.0, 14.0, Color(0xFFA78BFA), 0.65),
      (Offset(310, 180), -35.0, 16.0, Color(0xFFF472B6), 0.65),
      (Offset(200, 110), 5.0, 16.0, Color(0xFFFB923C), 0.6),
    ];
    for (final (center, rotDeg, r, color, opacity) in confetti) {
      canvas.save();
      canvas.translate(center.dx, center.dy);
      canvas.rotate(rotDeg * 3.14159265 / 180);
      final path = Path()
        ..addPolygon([
          Offset(0, -r),
          Offset(r * 0.866, r * 0.5),
          Offset(-r * 0.866, r * 0.5),
        ], true);
      canvas.drawPath(path, Paint()..color = color.withValues(alpha: opacity));
      canvas.restore();
    }
  }
}

class _AllSongsPainter extends _StockCoverPainter {
  const _AllSongsPainter();
  @override
  void paintShapes(Canvas canvas, double s) {
    _glow(canvas, const Offset(290, 120), 100, const Color(0xFF94A3B8), 0.16, 36);
    const colors = [Color(0xFF94A3B8), Color(0xFF475569)];
    void bar(double y, double w, double opacity) {
      final rect = RRect.fromRectAndRadius(
        Rect.fromLTWH(80, y, w, 24),
        const Radius.circular(6),
      );
      canvas.drawRRect(rect, _linearGrad(const Offset(0, 0), const Offset(400, 400), colors, opacity));
    }
    bar(98, 240, 1);
    bar(138, 180, 0.9);
    bar(178, 220, 0.82);
    bar(218, 140, 0.74);
    bar(258, 200, 0.66);
    bar(298, 160, 0.58);
  }
}

class _PlaylistPainter extends _StockCoverPainter {
  const _PlaylistPainter();
  @override
  void paintShapes(Canvas canvas, double s) {
    _glow(canvas, const Offset(200, 200), 120, const Color(0xFFA78BFA), 0.18, 40);
    const colors = [Color(0xFFA78BFA), Color(0xFF4C1D95)];
    Paint grad(double opacity) =>
        _linearGrad(const Offset(0, 0), const Offset(400, 400), colors, opacity);
    canvas.drawCircle(const Offset(150, 160), 70, grad(0.55));
    canvas.save();
    canvas.translate(255, 215);
    canvas.rotate(18 * 3.14159265 / 180);
    canvas.translate(-255, -215);
    final rrect = RRect.fromRectAndRadius(
      const Rect.fromLTWH(190, 150, 130, 130),
      const Radius.circular(14),
    );
    canvas.drawRRect(rrect, grad(0.8));
    canvas.restore();
    final tri = Path()
      ..addPolygon(const [Offset(120, 330), Offset(210, 330), Offset(165, 240)], true);
    canvas.drawPath(tri, grad(1));
  }
}

class MostPlayedCover extends StatelessWidget {
  final double? size;
  final BorderRadius? borderRadius;
  const MostPlayedCover({super.key, this.size = 48, this.borderRadius});
  @override
  Widget build(BuildContext context) => _wrap(size, borderRadius, const _MostPlayedPainter());
}

class RecentlyPlayedCover extends StatelessWidget {
  final double? size;
  final BorderRadius? borderRadius;
  const RecentlyPlayedCover({super.key, this.size = 48, this.borderRadius});
  @override
  Widget build(BuildContext context) => _wrap(size, borderRadius, const _RecentlyPlayedPainter());
}

class DownloadedCover extends StatelessWidget {
  final double? size;
  final BorderRadius? borderRadius;
  const DownloadedCover({super.key, this.size = 48, this.borderRadius});
  @override
  Widget build(BuildContext context) => _wrap(size, borderRadius, const _DownloadedPainter());
}

class FavouritesCover extends StatelessWidget {
  final double? size;
  final BorderRadius? borderRadius;
  const FavouritesCover({super.key, this.size = 48, this.borderRadius});
  @override
  Widget build(BuildContext context) => _wrap(size, borderRadius, const _FavouritesPainter());
}

class DiscoverCover extends StatelessWidget {
  final double? size;
  final BorderRadius? borderRadius;
  const DiscoverCover({super.key, this.size = 48, this.borderRadius});
  @override
  Widget build(BuildContext context) => _wrap(size, borderRadius, const _DiscoverPainter());
}

class WrappedCover extends StatelessWidget {
  final double? size;
  final BorderRadius? borderRadius;
  const WrappedCover({super.key, this.size = 48, this.borderRadius});
  @override
  Widget build(BuildContext context) => _wrap(size, borderRadius, const _WrappedPainter());
}

class AllSongsCover extends StatelessWidget {
  final double? size;
  final BorderRadius? borderRadius;
  const AllSongsCover({super.key, this.size = 48, this.borderRadius});
  @override
  Widget build(BuildContext context) => _wrap(size, borderRadius, const _AllSongsPainter());
}

class PlaylistCover extends StatelessWidget {
  final double? size;
  final BorderRadius? borderRadius;
  const PlaylistCover({super.key, this.size = 48, this.borderRadius});
  @override
  Widget build(BuildContext context) => _wrap(size, borderRadius, const _PlaylistPainter());
}

/// [size] null fills whatever space the parent gives it (e.g. a grid cell's
/// `Expanded`) instead of a fixed square.
Widget _wrap(double? size, BorderRadius? radius, CustomPainter painter) => ClipRRect(
      borderRadius: radius ?? BorderRadius.circular(6),
      child: size != null
          ? SizedBox(width: size, height: size, child: CustomPaint(painter: painter))
          : SizedBox.expand(child: CustomPaint(painter: painter)),
    );
