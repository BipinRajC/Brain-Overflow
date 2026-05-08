# Flutter Application Implementation Plan
> **v2.0** — Updated with all critical fixes, missing pieces, and architectural improvements.

---

## 1. Philosophy & Architecture

- **No `config/` folder**: Prompts, models, and room settings are read from and written to Supabase. The app is entirely dynamic.
- **Always room-based**: There is no "offline-only single-user mode." A solo user creates a private room and simply never shares the 6-character access code.
- **Minimal local state**: Hive is used only for:
  - Cached Supabase credentials (`url`, `anonKey`)
  - Current room context (`roomId`, `accessCode`, `authorName`)
  - Offline pending ideas queue
- **Supabase credentials are user-pasted**: On first launch the user enters `SUPABASE_URL` and `SUPABASE_ANON_KEY`. These are stored in an encrypted Hive box and used for every Supabase interaction.
- **Real-time first**: Home screen, chat view, and metadata badges all update via Supabase real-time subscriptions.
- **Iterative validation loop**: The Graham test is not a one-shot call. The user reads the AI's feedback in the chat and replies via a message input bar. This loop repeats until the idea scores `'Good Idea'`, at which point the card turns green on the Home screen. Two edge functions power this: `process_idea` (initial run) and `continue_idea_chat` (every follow-up turn).
- **Green/Red definition (source of truth)**: The validation state is derived from `idea_metadata.score`, not from `ideas.status`. `'Good Idea'` = green. `ideas.status` tracks processing state only (`recorded → processing → completed | failed`).

---

## 2. Project Structure

```
app/
├── lib/
│   ├── main.dart
│   ├── router.dart                  # go_router definition
│   ├── models/                      # Freezed data classes
│   │   ├── idea.dart
│   │   ├── chat_message.dart
│   │   ├── idea_metadata.dart
│   │   ├── prompt.dart
│   │   ├── model.dart
│   │   ├── room.dart
│   │   ├── room_config.dart
│   │   └── pending_idea.dart        # ← Hive-typed model (NEW)
│   ├── services/                    # Business logic / API wrappers
│   │   ├── supabase_init_service.dart
│   │   ├── room_service.dart
│   │   ├── idea_service.dart
│   │   ├── chat_service.dart
│   │   ├── metadata_service.dart
│   │   ├── prompt_service.dart
│   │   ├── model_service.dart
│   │   ├── speech_service.dart
│   │   └── offline_queue_service.dart
│   ├── providers/                   # Riverpod @riverpod codegen providers
│   │   ├── auth_credentials_provider.dart
│   │   ├── current_room_provider.dart
│   │   ├── ideas_list_provider.dart
│   │   ├── idea_detail_provider.dart
│   │   ├── chat_messages_provider.dart
│   │   ├── prompts_provider.dart
│   │   └── models_provider.dart
│   ├── screens/
│   │   ├── splash_screen.dart
│   │   ├── supabase_setup_screen.dart
│   │   ├── room_onboarding_screen.dart   # Create or Join
│   │   ├── home_screen.dart              # Idea list + filters
│   │   ├── idea_detail_screen.dart       # ChatGPT-like chat + input bar
│   │   ├── recording_screen.dart
│   │   ├── settings_screen.dart
│   │   ├── prompt_editor_screen.dart
│   │   └── model_manager_screen.dart
│   ├── widgets/
│   │   ├── idea_card.dart
│   │   ├── score_badge.dart
│   │   ├── category_badge.dart
│   │   ├── chat_bubble.dart
│   │   ├── prompt_badge.dart
│   │   ├── filter_chips.dart
│   │   └── typing_indicator.dart
│   └── utils/
│       ├── colors.dart
│       └── constants.dart
├── android/
│   └── app/src/main/AndroidManifest.xml  # RECORD_AUDIO permission
├── ios/
│   └── Runner/Info.plist                 # Speech + microphone permissions
├── pubspec.yaml
└── implementation_plan_app.md
```

---

## 3. Data Models (Freezed)

```dart
// lib/models/idea.dart
@freezed
class Idea with _$Idea {
  const factory Idea({
    required String id,
    required String roomId,
    required String authorName,
    @Default('recorded') String status,   // 'recorded' | 'processing' | 'completed' | 'failed'
    required DateTime createdAt,
    required DateTime updatedAt,
  }) = _Idea;

  factory Idea.fromJson(Map<String, dynamic> json) => _$IdeaFromJson(json);
}

// lib/models/chat_message.dart
@freezed
class ChatMessage with _$ChatMessage {
  const factory ChatMessage({
    required String id,
    required String ideaId,
    required String roomId,
    required String role,          // 'user' | 'assistant'
    required String content,
    String? promptId,
    String? modelId,
    @Default({}) Map<String, dynamic> metadata,
    required DateTime createdAt,
  }) = _ChatMessage;

  factory ChatMessage.fromJson(Map<String, dynamic> json) =>
      _$ChatMessageFromJson(json);
}

// lib/models/idea_metadata.dart
@freezed
class IdeaMetadata with _$IdeaMetadata {
  const factory IdeaMetadata({
    required String ideaId,
    String? category,
    String? score,               // 'Good Idea' | 'Weak' | 'Needs Pivot' | null
    String? refinedIdea,
    @Default([]) List<String> keyFeatures,
    String? targetPersona,
    @Default({}) Map<String, dynamic> paulGrahamDetails,
    @Default({}) Map<String, dynamic> responses,
    required DateTime updatedAt,
  }) = _IdeaMetadata;

  factory IdeaMetadata.fromJson(Map<String, dynamic> json) =>
      _$IdeaMetadataFromJson(json);
}

// lib/models/prompt.dart
@freezed
class Prompt with _$Prompt {
  const factory Prompt({
    required String id,
    required String roomId,
    required String name,
    required String displayName,
    required String systemPrompt,
    @Default(0) int executionOrder,
    @Default(true) bool isEnabled,
    @Default({}) Map<String, dynamic> responseSchema,
    @Default(false) bool updatesMetadata,
    required DateTime createdAt,
    required DateTime updatedAt,
  }) = _Prompt;

  factory Prompt.fromJson(Map<String, dynamic> json) => _$PromptFromJson(json);
}

// lib/models/model.dart
@freezed
class AiModel with _$AiModel {
  const factory AiModel({
    required String id,
    @Default('fireworks') String provider,
    required String displayName,
    required String apiModelId,
    @Default(true) bool isActive,
    required DateTime createdAt,
  }) = _AiModel;

  factory AiModel.fromJson(Map<String, dynamic> json) => _$AiModelFromJson(json);
}

// lib/models/room.dart
@freezed
class Room with _$Room {
  const factory Room({
    required String id,
    required String name,
    required String accessCode,
    @Default(true) bool isActive,
    required DateTime createdAt,
  }) = _Room;

  factory Room.fromJson(Map<String, dynamic> json) => _$RoomFromJson(json);
}

// lib/models/room_config.dart
@freezed
class RoomConfig with _$RoomConfig {
  const factory RoomConfig({
    required String roomId,
    required String selectedModelId,
    required DateTime updatedAt,
  }) = _RoomConfig;

  factory RoomConfig.fromJson(Map<String, dynamic> json) =>
      _$RoomConfigFromJson(json);
}
```

### 3.1 PendingIdea — Hive-typed model (NEW)

> **Critical:** Hive cannot serialize a plain Dart class. `PendingIdea` requires
> `@HiveType` and `@HiveField` annotations so `hive_generator` can produce
> an adapter. Run `build_runner` after adding this file.

```dart
// lib/models/pending_idea.dart
import 'package:hive/hive.dart';

part 'pending_idea.g.dart';   // generated by hive_generator

@HiveType(typeId: 0)
class PendingIdea extends HiveObject {
  @HiveField(0)
  final String id;

  @HiveField(1)
  final String transcript;

  @HiveField(2)
  final String authorName;

  @HiveField(3)
  final String roomId;

  @HiveField(4)
  final DateTime recordedAt;

  PendingIdea({
    required this.id,
    required this.transcript,
    required this.authorName,
    required this.roomId,
    required this.recordedAt,
  });
}
```

---

## 4. Onboarding Flow

```
Splash Screen
    │
    ▼
[Check Hive: do we have Supabase credentials?]
    │
    ├── NO  ──► SupabaseSetupScreen
    │               ├── Inputs: URL + Anon Key
    │               ├── "Test Connection" button (queries `models` table)
    │               └── On success: save to Hive, proceed
    │
    ▼
[Check Hive: do we have a current room?]
    │
    ├── NO  ──► RoomOnboardingScreen
    │               ├── "Create Room" tab
    │               │   ├── Input: Room Name, Your Name
    │               │   └── Calls `create_room` edge function
    │               │       └── Saves room_id, access_code, author_name to Hive
    │               └── "Join Room" tab
    │                   ├── Input: Access Code (6 chars), Your Name
    │                   └── Queries `rooms` by access_code via Supabase client
    │                       └── Saves room_id, access_code, author_name to Hive
    │
    ▼
HomeScreen
```

**Hive boxes:**
- `credentialsBox`: `supabaseUrl`, `supabaseAnonKey` (encrypted).
- `roomBox`: `roomId`, `accessCode`, `authorName`.
- `pendingIdeasBox`: Box of `PendingIdea` objects (typed, with registered adapter).

**Router (go_router) redirect logic in `router.dart`:**
```dart
redirect: (context, state) {
  final hasCreds = Hive.box('credentials').get('supabaseUrl') != null;
  final hasRoom  = Hive.box('room').get('roomId') != null;

  if (!hasCreds) return '/setup';
  if (!hasRoom)  return '/onboarding';
  return null; // proceed to requested route
},
```

---

## 5. Core Services

### 5.1 SupabaseInitService

```dart
class SupabaseInitService {
  static Future<void> initialize(String url, String anonKey) async {
    await Supabase.initialize(url: url, anonKey: anonKey);
  }

  static Future<bool> testConnection(String url, String anonKey) async {
    try {
      final client = SupabaseClient(url, anonKey);
      await client.from('models').select('id').limit(1);
      return true;
    } catch (_) {
      return false;
    }
  }
}
```

### 5.2 RoomService

```dart
class RoomService {
  final SupabaseClient _client;
  final Box<dynamic> _roomBox;

  RoomService(this._client, this._roomBox);

  Future<Room> createRoom({required String name, required String authorName}) async {
    final res = await _client.functions.invoke('create_room', body: {
      'name': name,
      'author_name': authorName,
    });
    final room = Room.fromJson(res.data);
    await _persistRoom(room, authorName);
    return room;
  }

  Future<Room> joinRoom({required String accessCode, required String authorName}) async {
    final data = await _client
        .from('rooms')
        .select()
        .eq('access_code', accessCode)
        .eq('is_active', true)
        .single();
    final room = Room.fromJson(data);
    await _persistRoom(room, authorName);
    return room;
  }

  Future<void> _persistRoom(Room room, String authorName) async {
    await _roomBox.putAll({
      'roomId': room.id,
      'accessCode': room.accessCode,
      'authorName': authorName,
    });
  }

  String? get roomId    => _roomBox.get('roomId');
  String? get authorName => _roomBox.get('authorName');
  String? get accessCode => _roomBox.get('accessCode');
}
```

### 5.3 IdeaService

> **Fix:** `syncAll` must NOT fall back to `enqueue` — see §5.4 for the split.

```dart
class IdeaService {
  final SupabaseClient _client;
  final RoomService _roomService;
  final OfflineQueueService _offline;

  IdeaService(this._client, this._roomService, this._offline);

  /// Called from RecordingScreen after voice capture.
  Future<String> createIdea(String transcript) async {
    final roomId = _roomService.roomId!;
    final author = _roomService.authorName!;
    final ideaId = const Uuid().v4();

    try {
      await _createIdeaDirect(ideaId: ideaId, roomId: roomId, author: author, transcript: transcript);
      return ideaId;
    } catch (e) {
      // Only enqueue from the public entry point; _createIdeaDirect always throws.
      await _offline.enqueue(
        ideaId: ideaId,
        transcript: transcript,
        authorName: author,
        roomId: roomId,
      );
      return ideaId; // Return local ID so UI can show "queued" state
    }
  }

  /// Direct insert with NO fallback. Used by syncAll to avoid double-queuing.
  Future<void> _createIdeaDirect({
    required String ideaId,
    required String roomId,
    required String author,
    required String transcript,
  }) async {
    await _client.from('ideas').insert({
      'id': ideaId,
      'room_id': roomId,
      'author_name': author,
      'status': 'recorded',
    });
    await _client.from('chat_messages').insert({
      'idea_id': ideaId,
      'room_id': roomId,
      'role': 'user',
      'content': transcript,
    });
    await _client.functions.invoke('process_idea', body: {
      'room_id': roomId,
      'idea_id': ideaId,
      'author_name': author,
      'transcript': transcript,
    });
  }

  /// Real-time stream of ideas in current room.
  Stream<List<Idea>> watchIdeas() {
    final roomId = _roomService.roomId;
    if (roomId == null) return const Stream.empty();
    return _client
        .from('ideas')
        .stream(primaryKey: ['id'])
        .eq('room_id', roomId)
        .order('created_at', ascending: false)
        .map((rows) => rows.map(Idea.fromJson).toList());
  }

  /// Fetch ideas with joined metadata for list display.
  /// Uses a LEFT join (not !inner) so newly recorded ideas without metadata
  /// still appear in the list while processing.
  Future<List<Map<String, dynamic>>> fetchIdeasWithMetadata() async {
    final roomId = _roomService.roomId!;
    return await _client
        .from('ideas')
        .select('*, idea_metadata(*)')     // LEFT join — no !inner
        .eq('room_id', roomId)
        .order('created_at', ascending: false);
  }
}
```

### 5.4 OfflineQueueService

> **Fix:** `syncAll` calls `_createIdeaDirect` (throws on failure) instead of
> `createIdea` (enqueues on failure). This prevents the same idea from being
> added to the queue twice.

```dart
class OfflineQueueService {
  late Box<PendingIdea> _box;

  Future<void> init() async {
    Hive.registerAdapter(PendingIdeaAdapter()); // generated adapter
    _box = await Hive.openBox<PendingIdea>('pending_ideas');
  }

  Future<void> enqueue({
    required String ideaId,
    required String transcript,
    required String authorName,
    required String roomId,
  }) async {
    await _box.put(
      ideaId,
      PendingIdea(
        id: ideaId,
        transcript: transcript,
        authorName: authorName,
        roomId: roomId,
        recordedAt: DateTime.now(),
      ),
    );
  }

  List<PendingIdea> get pending => _box.values.toList();

  Future<void> syncAll(IdeaService ideaService) async {
    for (final item in List.of(pending)) {
      try {
        // _createIdeaDirect throws on failure — item stays in queue.
        await ideaService._createIdeaDirect(
          ideaId: item.id,
          roomId: item.roomId,
          author: item.authorName,
          transcript: item.transcript,
        );
        await _box.delete(item.id);
      } catch (_) {
        // Leave in queue for next connectivity event.
      }
    }
  }
}
```

> **Note for backend engineer:** `_createIdeaDirect` is package-private to
> `IdeaService`. Expose it as a friend method or move `syncAll` inside
> `IdeaService` if Dart's visibility becomes an issue.

### 5.5 ChatService

> **New:** `sendUserMessage` — required for the iterative Graham test loop.
> Without this, the user has no way to reply to the AI's feedback.

```dart
class ChatService {
  final SupabaseClient _client;

  ChatService(this._client);

  /// Real-time stream of all messages for an idea (ascending for chat order).
  Stream<List<ChatMessage>> watchMessages(String ideaId) {
    return _client
        .from('chat_messages')
        .stream(primaryKey: ['id'])
        .eq('idea_id', ideaId)
        .order('created_at', ascending: true)
        .map((rows) => rows.map(ChatMessage.fromJson).toList());
  }

  /// Inserts a user message and triggers the 'continue_idea_chat' edge function.
  /// The edge function receives the full message history so the LLM has context.
  Future<void> sendUserMessage({
    required String ideaId,
    required String roomId,
    required String content,
    required List<ChatMessage> history,
  }) async {
    final messageId = const Uuid().v4();

    // Insert the user message first so it appears immediately in the stream.
    await _client.from('chat_messages').insert({
      'id': messageId,
      'idea_id': ideaId,
      'room_id': roomId,
      'role': 'user',
      'content': content,
    });

    // Trigger edge function with full history for context.
    await _client.functions.invoke('continue_idea_chat', body: {
      'idea_id': ideaId,
      'room_id': roomId,
      'message_id': messageId,
      'history': history
          .map((m) => {'role': m.role, 'content': m.content})
          .toList(),
    });
  }
}
```

### 5.6 MetadataService

```dart
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
```

### 5.7 PromptService

```dart
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
    return data.map(Prompt.fromJson).toList();
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
```

### 5.8 ModelService

```dart
class ModelService {
  final SupabaseClient _client;

  ModelService(this._client);

  Future<List<AiModel>> fetchModels() async {
    final data = await _client.from('models').select().order('created_at');
    return data.map(AiModel.fromJson).toList();
  }

  Future<void> updateModel(AiModel model) async {
    await _client.from('models').update({
      'provider': model.provider,
      'display_name': model.displayName,
      'api_model_id': model.apiModelId,
      'is_active': model.isActive,
    }).eq('id', model.id);
  }

  Future<void> createModel(AiModel model) async {
    await _client.from('models').insert({
      'id': model.id,
      'provider': model.provider,
      'display_name': model.displayName,
      'api_model_id': model.apiModelId,
      'is_active': model.isActive,
    });
  }

  Future<void> setRoomModel(String roomId, String modelId) async {
    await _client.from('room_config').upsert({
      'room_id': roomId,
      'selected_model_id': modelId,
      'updated_at': DateTime.now().toIso8601String(),
    });
  }
}
```

### 5.9 SpeechService

> **Fix:** The original `async*` / `yield` pattern inside a callback is broken
> in Dart — you cannot `yield` from within a synchronous callback. Use a
> `StreamController<String>` instead.

```dart
class SpeechService {
  final SpeechToText _speech = SpeechToText();
  StreamController<String>? _controller;

  Future<bool> init() async {
    await Permission.microphone.request();
    return _speech.initialize();
  }

  Stream<String> listen() {
    _controller = StreamController<String>();

    _speech.listen(
      onResult: (result) {
        if (!(_controller?.isClosed ?? true)) {
          _controller!.add(result.recognizedWords);
        }
      },
      listenFor: const Duration(minutes: 5),
      pauseFor: const Duration(seconds: 3),
      partialResults: true,
    );

    return _controller!.stream;
  }

  Future<void> stop() async {
    await _speech.stop();
    await _controller?.close();
    _controller = null;
  }
}
```

---

## 6. Providers (Riverpod with AsyncValue)

> **Fix:** All providers expose `AsyncValue<T>` so the UI can handle
> loading / error / data states with `.when(data, loading, error)`.
> Never expose raw Futures or throw unhandled exceptions to the UI layer.

```dart
// lib/providers/ideas_list_provider.dart
@riverpod
Stream<List<Idea>> ideasList(IdeasListRef ref) {
  final ideaService = ref.watch(ideaServiceProvider);
  return ideaService.watchIdeas();
}

// lib/providers/chat_messages_provider.dart
@riverpod
Stream<List<ChatMessage>> chatMessages(ChatMessagesRef ref, String ideaId) {
  final chatService = ref.watch(chatServiceProvider);
  return chatService.watchMessages(ideaId);
}

// lib/providers/idea_detail_provider.dart
@riverpod
Stream<IdeaMetadata?> ideaMetadata(IdeaMetadataRef ref, String ideaId) {
  final metadataService = ref.watch(metadataServiceProvider);
  return metadataService.watchMetadata(ideaId);
}

// lib/providers/prompts_provider.dart
@riverpod
Future<List<Prompt>> prompts(PromptsRef ref) async {
  final promptService = ref.watch(promptServiceProvider);
  return promptService.fetchPrompts();
}

// lib/providers/models_provider.dart
@riverpod
Future<List<AiModel>> models(ModelsRef ref) async {
  final modelService = ref.watch(modelServiceProvider);
  return modelService.fetchModels();
}
```

**UI consumption pattern (use everywhere):**
```dart
final ideasAsync = ref.watch(ideasListProvider);

ideasAsync.when(
  data: (ideas) => IdeaListWidget(ideas: ideas),
  loading: () => const CircularProgressIndicator(),
  error: (err, stack) => ErrorWidget(err.toString()),
);
```

---

## 7. UI / UX Design

### 7.1 Color System (`lib/utils/colors.dart`)

```dart
import 'package:flutter/material.dart';

class AppColors {
  // Score colors — maps idea_metadata.score to a display color
  static const Color scoreGood    = Color(0xFF4CAF50); // Green  — 'Good Idea'
  static const Color scoreWeak    = Color(0xFFFFA726); // Amber  — 'Weak'
  static const Color scorePivot   = Color(0xFFEF5350); // Red    — 'Needs Pivot'
  static const Color scoreUnknown = Color(0xFF9E9E9E); // Grey   — null / processing

  static Color scoreColor(String? score) {
    switch (score) {
      case 'Good Idea':   return scoreGood;
      case 'Weak':        return scoreWeak;
      case 'Needs Pivot': return scorePivot;
      default:            return scoreUnknown;
    }
  }

  // Connectivity status dot colors
  static const Color connOnline  = Color(0xFF4CAF50);
  static const Color connPending = Color(0xFFFFA726);
  static const Color connError   = Color(0xFFEF5350);
}
```

### 7.2 Home Screen (`home_screen.dart`)

**Layout:**
- **AppBar**: Room name + connectivity status dot.
  - 🟢 Green = online, no pending.
  - 🟡 Amber = online but `offline.pending.isNotEmpty`. Tapping opens a dialog listing queued ideas with a "Retry Now" button.
  - 🔴 Red = Supabase connection error.
- **Filter Chips** (horizontal scroll):
  - Categories: All, Startup, Developer Tool, Fun Project, etc.
  - Scores: All, Good Idea, Weak, Needs Pivot.
  - Tapping a chip rebuilds the list query using `.eq()` on joined `idea_metadata`.
- **Idea List** (`ListView`):
  - Each item is an `IdeaCard` showing:
    - Author name + timestamp.
    - **CategoryBadge** (small chip, neutral color).
    - **ScoreBadge** (colored background from `AppColors.scoreColor`). This is the green/red indicator — no separate status field needed.
    - Preview text: `idea_metadata.refined_idea` if available, otherwise first user message content.
    - Processing dot: blue spinner if `status == 'processing'`, nothing otherwise.
- **FAB**: Circular microphone button → `RecordingScreen`.

### 7.3 Idea Detail Screen (`idea_detail_screen.dart`)

**Layout — ChatGPT-style with input bar:**

```
┌────────────────────────────────────────────┐
│  ← Back        "Idea Title"     [⋮ menu]  │  AppBar
├────────────────────────────────────────────┤
│  [ Category: Startup ] [ Score: Weak 🟡 ]  │  ← Collapsible pinned header
│  Refined: "An app that validates startup…" │
│  Persona: "First-time founder"             │
│  Features: [Voice input] [Graham test] …   │
├────────────────────────────────────────────┤
│                                            │
│  [User transcript bubble — right aligned]  │
│                                            │
│  ┌─────────────────────────────────────┐  │
│  │ 🏷 Paul Graham Test                 │  │  ← PromptBadge
│  │ **Core Assumption:** …              │  │  ← flutter_markdown
│  │ **Fatal Flaws:**                    │  │
│  │  1. …                               │  │
│  └─────────────────────────────────────┘  │
│                                            │
│  [User reply bubble — right aligned]       │
│                                            │
│  ┌── typing indicator (3 animated dots) ──┐│  ← shown when processing
│                                            │
├────────────────────────────────────────────┤
│  [  Type a reply...          ] [ ➤ Send ] │  ← Message input bar (REQUIRED)
└────────────────────────────────────────────┘
```

**Message input bar implementation:**
```dart
// Bottom of IdeaDetailScreen — required for the iterative loop
Row(
  children: [
    Expanded(
      child: TextField(
        controller: _inputController,
        decoration: const InputDecoration(hintText: 'Type a reply...'),
        textInputAction: TextInputAction.send,
        onSubmitted: (_) => _sendMessage(),
      ),
    ),
    IconButton(
      icon: const Icon(Icons.send),
      onPressed: _sendMessage,
    ),
  ],
)

Future<void> _sendMessage() async {
  final text = _inputController.text.trim();
  if (text.isEmpty) return;
  _inputController.clear();

  await ref.read(chatServiceProvider).sendUserMessage(
    ideaId: widget.ideaId,
    roomId: currentRoomId,
    content: text,
    history: ref.read(chatMessagesProvider(widget.ideaId)).valueOrNull ?? [],
  );
}
```

**Bubble alignment:**
- User messages: `CrossAxisAlignment.end`, `primaryContainer` background, max 70% width.
- Assistant messages: `CrossAxisAlignment.start`, `surfaceContainerHighest` background, max 85% width.
- Each assistant bubble has a `PromptBadge` at the top (shows `prompt.display_name`).
- Assistant body uses `flutter_markdown` for formatted content.

**Typing indicator:** shown when `ideas.status == 'processing'` AND last message is from the user.

### 7.4 Recording Screen (`recording_screen.dart`)

- Large pulsing `AnimatedContainer` microphone circle using `AnimationController` (don't use simple `setState` — the mic may stay open for minutes).
- Live transcript text in a scrollable container below the mic.
- "Save Idea" button:
  - Calls `IdeaService.createIdea(transcript)`.
  - On immediate success → pop back to Home (idea appears via real-time stream).
  - On failure → shows "Saved offline — will sync when connected" `SnackBar`.

### 7.5 Settings & Prompt Editor

**SettingsScreen tabs:**
- **Room**: Display access code (copy-to-clipboard), author name, leave room button.
- **AI Model**: Dropdown of active `models`. Selecting updates `room_config.selected_model_id`.
- **Prompts**: Navigates to `PromptEditorScreen`.
- **Server**: Change Supabase URL + Anon Key (clears Hive and restarts app via `go_router` redirect).

**PromptEditorScreen:**
- `ReorderableListView` of current room's prompts.
- Toggle switch for `is_enabled`.
- Tap to expand inline editor:
  - `display_name`, `system_prompt` (multiline).
  - `response_schema` via a JSON `TextField` (with basic validation on save).
  - Toggle `updates_metadata`.
- "Add Prompt" FAB creates a new prompt with default schema `{}`.

### 7.6 Model Manager (`model_manager_screen.dart`)

- List of all global models.
- Add / Edit / Deactivate (cannot delete if referenced by `room_config` — enforced by `ON DELETE RESTRICT` at the DB level).
- Fields: `provider`, `display_name`, `api_model_id`, `is_active`.

---

## 8. Offline & Sync Strategy

> **Fix:** `connectivity_plus` v5+ `onConnectivityChanged` emits
> `List<ConnectivityResult>`, not a single `ConnectivityResult`. The original
> single-value check would crash at runtime.

```dart
// In main.dart or a top-level provider listener
void handleConnectivity(IdeaService ideaService, OfflineQueueService offline) {
  Connectivity().onConnectivityChanged.listen((List<ConnectivityResult> results) {
    final isOnline = results.any((r) => r != ConnectivityResult.none);
    if (isOnline && offline.pending.isNotEmpty) {
      offline.syncAll(ideaService);
    }
  });
}
```

**Visual indicators:**
- Home screen AppBar dot turns **amber** if `offline.pending.isNotEmpty`.
- Tapping the dot → dialog listing queued ideas with "Retry Now" and "Clear All" options.

---

## 9. Routing (`router.dart`)

```dart
final router = GoRouter(
  initialLocation: '/splash',
  redirect: (context, state) {
    final hasCreds = Hive.box('credentials').get('supabaseUrl') != null;
    final hasRoom  = Hive.box('room').get('roomId') != null;
    if (!hasCreds) return '/setup';
    if (!hasRoom)  return '/onboarding';
    return null;
  },
  routes: [
    GoRoute(path: '/splash',          builder: (_, __) => const SplashScreen()),
    GoRoute(path: '/setup',           builder: (_, __) => const SupabaseSetupScreen()),
    GoRoute(path: '/onboarding',      builder: (_, __) => const RoomOnboardingScreen()),
    GoRoute(path: '/home',            builder: (_, __) => const HomeScreen()),
    GoRoute(
      path: '/idea/:ideaId',
      builder: (_, state) => IdeaDetailScreen(ideaId: state.pathParameters['ideaId']!),
    ),
    GoRoute(path: '/record',          builder: (_, __) => const RecordingScreen()),
    GoRoute(path: '/settings',        builder: (_, __) => const SettingsScreen()),
    GoRoute(path: '/settings/prompts', builder: (_, __) => const PromptEditorScreen()),
    GoRoute(path: '/settings/models', builder: (_, __) => const ModelManagerScreen()),
  ],
);
```

---

## 10. Dependencies (`pubspec.yaml`)

```yaml
dependencies:
  flutter:
    sdk: flutter

  # Supabase
  supabase_flutter: ^2.5.0

  # Speech
  speech_to_text: ^6.6.0
  permission_handler: ^11.3.0

  # State Management
  flutter_riverpod: ^2.6.0
  riverpod_annotation: ^2.3.5
  hooks_riverpod: ^2.6.0         # pairs well with flutter_hooks for lifecycle
  flutter_hooks: ^0.20.5

  # Routing
  go_router: ^14.0.0             # required for 8+ screen navigation

  # Local Storage
  hive: ^2.2.3
  hive_flutter: ^1.1.0

  # Connectivity
  connectivity_plus: ^6.0.0      # v6 — onConnectivityChanged returns List<ConnectivityResult>

  # UI
  flutter_markdown: ^0.7.3
  gap: ^3.0.1

  # Utils
  json_annotation: ^4.9.0
  freezed_annotation: ^2.4.1
  uuid: ^4.5.0

dev_dependencies:
  build_runner: ^2.4.0
  freezed: ^2.5.0
  json_serializable: ^6.8.0
  hive_generator: ^2.0.1
  riverpod_generator: ^2.4.0    # codegen for @riverpod providers
  riverpod_lint: ^2.3.0
  custom_lint: ^0.6.0
```

---

## 11. Platform Setup (Required — do not skip)

### 11.1 iOS (`ios/Runner/Info.plist`)

> Without these entries, `speech_to_text` silently fails on iOS with no error.

```xml
<key>NSSpeechRecognitionUsageDescription</key>
<string>IdeaVault uses speech recognition to capture your idea.</string>
<key>NSMicrophoneUsageDescription</key>
<string>IdeaVault needs microphone access to record your idea.</string>
```

### 11.2 Android (`android/app/src/main/AndroidManifest.xml`)

Add inside `<manifest>`:
```xml
<uses-permission android:name="android.permission.RECORD_AUDIO"/>
<uses-permission android:name="android.permission.INTERNET"/>
```

---

## 12. Key Implementation Notes

### No `config/` Folder
- No `config/prompts.json` or `config/models.json` in the repo.
- Default prompts are created by the `create_room` edge function.
- Default models are seeded by `terraform/seed.js`.
- The Flutter app reads everything from Supabase at runtime.

### Iterative Loop — Edge Function Contract
Two edge functions are required (backend engineer's responsibility):

| Function | Triggered by | Purpose |
|---|---|---|
| `process_idea` | Initial transcript save | Runs all enabled room prompts in order, writes responses as assistant `chat_messages`, updates `idea_metadata` |
| `continue_idea_chat` | `sendUserMessage()` | Receives full message history, runs next appropriate prompt, writes assistant response, re-evaluates and updates `idea_metadata.score` |

The loop terminates on the UI side when `idea_metadata.score == 'Good Idea'` — there is no explicit "done" signal. The user can keep replying even after reaching green.

### Green / Red Source of Truth
- `idea_metadata.score` is the **only** source of truth for the green/red state.
- `ideas.status` tracks processing state only and is never used for colour-coding.
- `ScoreBadge` and `IdeaCard` border colour both derive from `AppColors.scoreColor(metadata?.score)`.

### ChatGPT-like Layout
- `CrossAxisAlignment.end` for user bubbles, `.start` for assistant.
- Constrain user bubble width to ~70% of screen width.
- Constrain assistant bubble width to ~85% of screen width.
- Use `flutter_markdown` for assistant content (edge function returns Markdown).
- Auto-scroll `ListView` to bottom on new message using a `ScrollController`.

### Filtering on Home Screen
Supabase query for category filter (LEFT join, not !inner):
```dart
_client.from('ideas')
  .select('*, idea_metadata(*)')
  .eq('room_id', roomId)
  .eq('idea_metadata.category', 'Startup Idea')
  .order('created_at', ascending: false);
```
Use Riverpod `StateNotifier` to rebuild the query when filter chips change.

### First-Launch Credential Flow
- `SplashScreen` checks Hive boxes and immediately calls `context.go()` to the correct route.
- `go_router`'s `redirect` handles all subsequent navigation guards automatically.
- Do NOT use a `FutureBuilder` in `main.dart` — let the router handle it.

---

## 13. Build Steps

```bash
cd app
flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter build apk --release          # Android
flutter build ipa                    # iOS (requires Xcode + Apple Developer account)
```

**Verify before every release:**
1. `grep -r "SUPABASE_URL\|SUPABASE_ANON_KEY" lib/` → must return zero results.
2. `flutter analyze` → zero errors, zero warnings.
3. Test offline recording on Android emulator by toggling airplane mode after app launch.
4. Test iOS microphone prompt appears on first record attempt in iOS simulator.

---

## 14. Backend Engineer Checklist

Items the Flutter app depends on that must be delivered by the backend:

- [ ] `create_room` edge function — creates room + seeds default prompts, returns `Room` JSON
- [ ] `process_idea` edge function — runs all enabled prompts in order, writes `chat_messages` rows, updates `idea_metadata`
- [ ] `continue_idea_chat` edge function — accepts `{ idea_id, room_id, history[] }`, writes next assistant `chat_messages` row, re-evaluates and updates `idea_metadata.score`
- [ ] RLS policies on all tables scoped to `room_id` access code check
- [ ] `idea_metadata` table has a `score` column with allowed values: `'Good Idea'`, `'Weak'`, `'Needs Pivot'`
- [ ] `ideas.status` transitions: `recorded → processing → completed | failed` (managed by edge functions)
- [ ] `models` table seeded by `terraform/seed.js` before any user can test

---

*End of Flutter Application Implementation Plan v2.0*
