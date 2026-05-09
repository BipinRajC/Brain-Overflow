import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/idea_metadata.dart';
import '../services/metadata_service.dart';

part 'idea_detail_provider.g.dart';

@riverpod
Stream<IdeaMetadata?> ideaMetadata(IdeaMetadataRef ref, String ideaId) {
  final metadataService = MetadataService(Supabase.instance.client);
  return metadataService.watchMetadata(ideaId);
}
