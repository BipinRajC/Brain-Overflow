# Flutter Application Implementation Plan

## 1. Philosophy & Architecture

- **No `config/` folder**: Prompts, models, and room settings are read from and written to Supabase. The app is entirely dynamic.
- **Always room-based**: There is no "offline-only single-user mode." A solo user creates a private room and simply never shares the 6-character access code.
- **Minimal local state**: Hive is used only for:
  - Cached Supabase credentials (`url`, `anonKey`)
  - Current room context (`roomId`, `accessCode`, `authorName`)
  - Offline pending ideas queue
- **Supabase credentials are user-pasted**: On first launch the user enters `SUPABASE_URL` and `SUPABASE_ANON_KEY`. These are stored in an encrypted Hive box and used for every Supabase interaction.
- **Real-time first**: Home screen, chat view, and metadata badges all update via Supabase real-time subscriptions.

---

## 2. Project Structure

```
app/
├── lib/
│   ├── main.dart
│   ├── models/                  # Freezed data classes
│   │   ├── idea.dart
│   │   ├── chat_message.dart
│   │   ├── idea_metadata.dart
│   │   ├── prompt.dart
│   │   ├── model.dart
│   │   ├── room.dart
│   │   └── room_config.dart
│   ├── services/                # Business logic / API wrappers
│   │   ├── supabase_init_service.dart
│   │   ├── room_service.dart
│   │   ├── idea_service.dart
│   │   ├── chat_service.dart
│   │   ├── metadata_service.dart
│   │   ├── prompt_service.dart
│   │   ├── model_service.dart
│   │   ├── speech_service.dart
│   │   └── offline_queue_service.dart
│   ├── providers/               # Riverpod state providers
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
│   │   ├── idea_detail_screen.dart       # ChatGPT-like chat
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
│   │   └── filter_chips.dart
│   └── utils/
│       ├── colors.dart
│       └── constants.dart
├── android/
├── ios/
├── pubspec.yaml
└── implementation_plan_app.md   # This file
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
    @Default('recorded') String status,
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
    String? score,
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
- `pendingIdeasBox`: Queue of `PendingIdea` objects for offline sync.

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

  String? get roomId => _roomBox.get('roomId');
  String? get authorName => _roomBox.get('authorName');
  String? get accessCode => _roomBox.get('accessCode');
}
```

### 5.3 IdeaService

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
      // 1. Insert idea header
      await _client.from('ideas').insert({
        'id': ideaId,
        'room_id': roomId,
        'author_name': author,
        'status': 'recorded',
      });

      // 2. Insert user transcript as first chat message
      await _client.from('chat_messages').insert({
        'idea_id': ideaId,
        'room_id': roomId,
        'role': 'user',
        'content': transcript,
      });

      // 3. Trigger edge function
      await _client.functions.invoke('process_idea', body: {
        'room_id': roomId,
        'idea_id': ideaId,
        'author_name': author,
        'transcript': transcript,
      });

      return ideaId;
    } catch (e) {
      // On any failure, queue locally
      await _offline.enqueue(ideaId: ideaId, transcript: transcript, authorName: author, roomId: roomId);
      return ideaId; // Still return local ID so UI can show "queued" state
    }
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
  Future<List<Map<String, dynamic>>> fetchIdeasWithMetadata() async {
    final roomId = _roomService.roomId!;
    return await _client
        .from('ideas')
        .select('*, idea_metadata!inner(*)')
        .eq('room_id', roomId)
        .order('created_at', ascending: false);
  }
}
```

### 5.4 OfflineQueueService

```dart
class OfflineQueueService {
  late Box<PendingIdea> _box;

  Future<void> init() async {
    _box = await Hive.openBox<PendingIdea>('pending_ideas');
  }

  Future<void> enqueue({
    required String ideaId,
    required String transcript,
    required String authorName,
    required String roomId,
  }) async {
    await _box.put(ideaId, PendingIdea(
      id: ideaId,
      transcript: transcript,
      authorName: authorName,
      roomId: roomId,
      recordedAt: DateTime.now(),
    ));
  }

  List<PendingIdea> get pending => _box.values.toList();

  Future<void> syncAll(IdeaService ideaService) async {
    for (final item in pending) {
      try {
        await ideaService.createIdea(item.transcript);
        await _box.delete(item.id);
      } catch (_) {
        // Leave in queue for next attempt
      }
    }
  }
}
```

### 5.5 ChatService

```dart
class ChatService {
  final SupabaseClient _client;

  ChatService(this._client);

  Stream<List<ChatMessage>> watchMessages(String ideaId) {
    return _client
        .from('chat_messages')
        .stream(primaryKey: ['id'])
        .eq('idea_id', ideaId)
        .order('created_at', ascending: true)
        .map((rows) => rows.map(ChatMessage.fromJson).toList());
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

```dart
class SpeechService {
  final SpeechToText _speech = SpeechToText();

  Future<bool> init() async {
    await Permission.microphone.request();
    return _speech.initialize();
  }

  Stream<String> listen() async* {
    await _speech.listen(
      onResult: (result) => yield result.recognizedWords,
      listenFor: const Duration(minutes: 5),
      pauseFor: const Duration(seconds: 3),
      partialResults: true,
    );
  }

  Future<void> stop() => _speech.stop();
}
```

---

## 6. UI / UX Design

### 6.1 Color System (`lib/utils/colors.dart`)

```dart
import 'package:flutter/material.dart';

class AppColors {
  static const Color scoreGood = Color(0xFF4CAF50);      // Green
  static const Color scoreWeak = Color(0xFFFFA726);      // Amber
  static const Color scorePivot = Color(0xFFEF5350);     // Red
  static const Color scoreUnknown = Color(0xFF9E9E9E);   // Grey

  static Color scoreColor(String? score) {
    switch (score) {
      case 'Good Idea': return scoreGood;
      case 'Weak': return scoreWeak;
      case 'Needs Pivot': return scorePivot;
      default: return scoreUnknown;
    }
  }
}
```

### 6.2 Home Screen (`home_screen.dart`)

**Layout:**
- **AppBar**: Room name + connection status dot (green = online, amber = offline with pending sync, red = error).
- **Filter Chips** (horizontal scroll):
  - Categories: All, Startup, Developer Tool, Fun Project, etc.
  - Scores: All, Good Idea, Weak, Needs Pivot.
  - Tapping a chip rebuilds the list query using `.eq()` on joined `idea_metadata`.
- **Idea List** (`ListView`):
  - Each item is an `IdeaCard` showing:
    - Author name + timestamp.
    - **CategoryBadge** (small chip, neutral color).
    - **ScoreBadge** (colored background based on `AppColors.scoreColor`).
    - Preview text: `idea_metadata.refined_idea` if available, otherwise first user message content (fetched via a lightweight join or cached).
    - Status indicator: small dot (blue = processing, grey = recorded, green = completed, red = failed).
- **FAB**: Circular microphone button → `RecordingScreen`.

### 6.3 Idea Detail Screen (`idea_detail_screen.dart`)

**Layout — ChatGPT-style:**
- **Pinned Header Card** (collapsible):
  - Category chip.
  - Score chip (color-coded).
  - Refined idea text (if available).
  - Target persona (small text).
  - Key features as a wrap of mini chips.
- **Message List** (`ListView.builder`):
  - **User messages** (`role == 'user'`):
    - Aligned **right**.
    - Background: `Theme.of(context).colorScheme.primaryContainer`.
    - Text: transcript.
  - **Assistant messages** (`role == 'assistant'`):
    - Aligned **left**.
    - Background: `Theme.of(context).colorScheme.surfaceContainerHighest`.
    - Top row: `PromptBadge` showing `prompt.display_name` (e.g., "Categorize & Refine", "Paul Graham Test").
    - Body: Markdown rendering (`flutter_markdown`) of the formatted content.
- **Typing Indicator**:
  - Shown when `ideas.status == 'processing'` and the last message is not from an assistant with the final prompt.

### 6.4 Recording Screen (`recording_screen.dart`)

- Large pulsing microphone circle.
- Live transcript text below.
- "Save Idea" button:
  - Calls `IdeaService.createIdea(transcript)`.
  - On immediate success → pops back to Home (idea appears via real-time stream).
  - On failure → shows "Saved offline — will sync when connected" toast.

### 6.5 Settings & Prompt Editor (`settings_screen.dart`, `prompt_editor_screen.dart`)

**SettingsScreen tabs:**
- **Room**: Display access code (copy-to-clipboard), author name, leave room button.
- **AI Model**: Dropdown of global `models`. Selecting updates `room_config.selected_model_id`.
- **Prompts**: Navigates to `PromptEditorScreen`.
- **Server**: Change Supabase URL + Anon Key (restarts app).

**PromptEditorScreen:**
- Reorderable list of current room's prompts.
- Toggle switch for `is_enabled`.
- Tap to expand:
  - Edit `display_name`, `system_prompt`.
  - Edit `response_schema` via a JSON text field (with syntax highlighting if possible).
  - Toggle `updates_metadata`.
- "Add Prompt" button:
  - Creates a new prompt with default schema `{}`.

### 6.6 Model Manager (`model_manager_screen.dart`)

- List of all global models.
- Add / Edit / Deactivate (cannot delete if used by any `room_config` — enforced by DB `ON DELETE RESTRICT`).
- Fields: `id`, `provider`, `display_name`, `api_model_id`, `is_active`.

---

## 7. Offline & Sync Strategy

```dart
// In main.dart or a top-level provider listener
void handleConnectivity(IdeaService ideaService, OfflineQueueService offline) {
  Connectivity().onConnectivityChanged.listen((result) {
    if (result != ConnectivityResult.none && offline.pending.isNotEmpty) {
      offline.syncAll(ideaService);
    }
  });
}
```

**Visual indicators:**
- Home screen app-bar dot turns **amber** if `offline.pending.isNotEmpty`.
- Tap dot → dialog listing queued ideas with option to "Retry Now".

---

## 8. Dependencies (`pubspec.yaml`)

```yaml
dependencies:
  flutter:
    sdk: flutter

  # Supabase
  supabase_flutter: ^2.5.0

  # Speech
  speech_to_text: ^6.6.0
  permission_handler: ^11.0.0

  # State Management
  flutter_riverpod: ^2.5.0

  # Local Storage
  hive: ^2.2.3
  hive_flutter: ^1.1.0

  # Connectivity
  connectivity_plus: ^5.0.0

  # UI
  flutter_markdown: ^0.6.20
  gap: ^3.0.1

  # Utils
  json_annotation: ^4.8.1
  freezed_annotation: ^2.4.1
  uuid: ^4.3.0

dev_dependencies:
  build_runner: ^2.4.0
  freezed: ^2.4.0
  json_serializable: ^6.7.0
  hive_generator: ^2.0.1
```

---

## 9. Key Implementation Notes

### No `config/` Folder
- There is no `config/prompts.json` or `config/models.json` in the repo.
- Default prompts are created by the `create_room` edge function.
- Default models are seeded by `terraform/seed.js`.
- The Flutter app reads everything from Supabase at runtime.

### ChatGPT-like Layout
- Use `CrossAxisAlignment.end` for user bubbles, `.start` for assistant.
- Constrain bubble width to ~70% of screen width.
- Use `flutter_markdown` for assistant content (the edge function returns Markdown).

### Metadata Color Coding
- `ScoreBadge` widget uses `AppColors.scoreColor(score)` for its background.
- Ensure sufficient contrast (white text on colored background).

### Filtering
- Supabase query for category filter:
  ```dart
  _client.from('ideas')
    .select('*, idea_metadata!inner(*)')
    .eq('room_id', roomId)
    .eq('idea_metadata.category', 'Startup Idea')
    .order('created_at', ascending: false);
  ```
- Use Riverpod `StateNotifier` to rebuild the query when filter chips change.

### First-Launch Credential Flow
- Use a `FutureBuilder` in `main.dart` that checks Hive.
- If no credentials → navigate to `SupabaseSetupScreen`.
- If credentials exist but no room → navigate to `RoomOnboardingScreen`.
- Otherwise → `HomeScreen`.

---

## 10. Build Steps

```bash
cd app
flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter build apk --release
```

**Critical:** Verify the APK contains **zero** hardcoded credentials. The `SUPABASE_URL` and `SUPABASE_ANON_KEY` are entered by the end user at runtime.

---

*End of Flutter Application Implementation Plan*
