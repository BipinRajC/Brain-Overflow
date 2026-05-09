import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';
import '../models/chat_message.dart';

class ChatService {
  final SupabaseClient _client;

  ChatService(this._client);

  Stream<List<ChatMessage>> watchMessages(String ideaId) {
    return _client
        .from('chat_messages')
        .stream(primaryKey: ['id'])
        .eq('idea_id', ideaId)
        .order('created_at', ascending: true)
        .map((rows) => rows.map((r) => ChatMessage.fromJson(r)).toList());
  }

  Future<void> sendUserMessage({
    required String ideaId,
    required String roomId,
    required String content,
    required List<ChatMessage> history,
  }) async {
    final messageId = const Uuid().v4();

    await _client.from('chat_messages').insert({
      'id': messageId,
      'idea_id': ideaId,
      'room_id': roomId,
      'role': 'user',
      'content': content,
    });

    await _client.functions.invoke('continue_idea_chat', body: {
      'idea_id': ideaId,
      'room_id': roomId,
      'message_id': messageId,
      'history':
          history.map((m) => {'role': m.role, 'content': m.content}).toList(),
    });
  }
}
