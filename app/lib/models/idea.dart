import 'package:freezed_annotation/freezed_annotation.dart';

part 'idea.freezed.dart';
part 'idea.g.dart';

@freezed
class Idea with _$Idea {
  const factory Idea({
    required String id,
    required String roomId,
    required String authorName,
    @Default('recorded') String status,
    required DateTime createdAt,
    required DateTime updatedAt,
  }) = _Idea;

  factory Idea.fromJson(Map<String, dynamic> json) => _$IdeaFromJson(json);
}
