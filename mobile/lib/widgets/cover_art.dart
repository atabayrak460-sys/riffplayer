import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

class CoverArt extends StatelessWidget {
  final String? url;
  final double size;
  final BorderRadius? borderRadius;

  const CoverArt({
    super.key,
    required this.url,
    this.size = 48,
    this.borderRadius,
  });

  @override
  Widget build(BuildContext context) {
    final radius = borderRadius ?? BorderRadius.circular(6);

    if (url == null) return _placeholder(radius);

    return ClipRRect(
      borderRadius: radius,
      child: CachedNetworkImage(
        imageUrl: url!,
        width: size,
        height: size,
        fit: BoxFit.cover,
        placeholder: (_, __) => _placeholderBox(),
        errorWidget: (_, __, ___) => _placeholderBox(),
      ),
    );
  }

  Widget _placeholder(BorderRadius radius) => ClipRRect(
        borderRadius: radius,
        child: _placeholderBox(),
      );

  Widget _placeholderBox() => Container(
        width: size,
        height: size,
        color: const Color(0xFF27272A),
        child: Icon(
          Icons.music_note,
          size: size * 0.4,
          color: const Color(0xFF52525B),
        ),
      );
}
