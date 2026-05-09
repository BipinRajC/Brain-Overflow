import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/idea_metadata.dart';

class MetadataService {
  final SupabaseClient _client;

  MetadataService(this._client);

  Stream<IdeaMetadata?> watchMetadata(String ideaId) {
    return _client
        .from('idea_metadata')
        .stream(primaryKey: ['idea_id'])
        .eq('idea_id', ideaId)
        .map((rows) => rows.isEmpty ? null : IdeaMetadata.fromJson(rows.first));
  }
}
