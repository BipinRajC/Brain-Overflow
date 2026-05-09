import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/prompt.dart';
import 'room_service.dart';

class PromptService {
  final SupabaseClient _client;
  final RoomService _roomService;

  PromptService(this._client, this._roomService);

  Future<List<Prompt>> fetchPrompts() async {
    final roomId = _roomService.roomId!;
    final data = await _client
        .from('prompts')
        .select()
        .eq('room_id', roomId)
        .order('execution_order', ascending: true);
    return data.map((d) => Prompt.fromJson(d)).toList();
  }

  Future<void> updatePrompt(Prompt prompt) async {
    await _client.from('prompts').update({
      'display_name': prompt.displayName,
      'system_prompt': prompt.systemPrompt,
      'execution_order': prompt.executionOrder,
      'is_enabled': prompt.isEnabled,
      'response_schema': prompt.responseSchema,
      'updates_metadata': prompt.updatesMetadata,
      'updated_at': DateTime.now().toIso8601String(),
    }).eq('id', prompt.id);
  }

  Future<void> createPrompt(Prompt prompt) async {
    await _client.from('prompts').insert({
      'room_id': _roomService.roomId!,
      'name': prompt.name,
      'display_name': prompt.displayName,
      'system_prompt': prompt.systemPrompt,
      'execution_order': prompt.executionOrder,
      'is_enabled': prompt.isEnabled,
      'response_schema': prompt.responseSchema,
      'updates_metadata': prompt.updatesMetadata,
    });
  }
}
