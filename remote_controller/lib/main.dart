import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

void main() {
  runApp(const ResqRemoteApp());
}

class ResqRemoteApp extends StatelessWidget {
  const ResqRemoteApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ResQ-Atlas Remote Controller',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0B0D0C),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFFC8F36C), // Lime
          secondary: Color(0xFFF2BF6B), // Amber
          surface: Color(0xFF141916),
        ),
        fontFamily: 'Segoe UI',
      ),
      home: const RemoteControllerScreen(),
    );
  }
}

class RemoteControllerScreen extends StatefulWidget {
  const RemoteControllerScreen({super.key});

  @override
  State<RemoteControllerScreen> createState() => _RemoteControllerScreenState();
}

class _RemoteControllerScreenState extends State<RemoteControllerScreen> {
  late final TextEditingController _hostController;
  final TextEditingController _customCountController = TextEditingController();

  bool _isConnected = false;
  bool _isOverrideActive = false;
  int _peopleCount = 0;
  String _activeZone = 'B2';
  String _activityState = 'QUIET';
  int? _breathingBpm;
  double _disturbanceLevel = 0.65;
  List<String> _hotZones = [];
  String _statusMessage = 'Tap "Connect & Test" to link with laptop';
  int? _lastPingMs;
  Timer? _statusTimer;

  final List<String> _zones = [
    'A1', 'A2', 'A3',
    'B1', 'B2', 'B3',
    'C1', 'C2', 'C3',
  ];

  @override
  void initState() {
    super.initState();
    String defaultHost = '10.13.181.190:4175';
    if (kIsWeb) {
      final host = Uri.base.host;
      if (host.isNotEmpty && host != 'localhost' && host != '127.0.0.1') {
        defaultHost = '$host:4175';
      }
    }
    _hostController = TextEditingController(text: defaultHost);
    _checkConnection();
    // Poll status every 3 seconds
    _statusTimer = Timer.periodic(const Duration(seconds: 3), (_) {
      if (_isConnected) _fetchCurrentState();
    });
  }

  @override
  void dispose() {
    _statusTimer?.cancel();
    _hostController.dispose();
    _customCountController.dispose();
    super.dispose();
  }

  String get _baseUrl {
    String host = _hostController.text.trim();
    if (host.isEmpty) host = '10.13.181.190:4175';
    if (!host.startsWith('http://') && !host.startsWith('https://')) {
      host = 'http://$host';
    }
    return host;
  }

  Future<void> _checkConnection() async {
    final sw = Stopwatch()..start();
    try {
      final res = await http
          .get(Uri.parse('$_baseUrl/api/health'))
          .timeout(const Duration(seconds: 3));
      sw.stop();
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        setState(() {
          _isConnected = true;
          _lastPingMs = sw.elapsedMilliseconds;
          _statusMessage =
              'Connected to ${data['serialPath'] ?? 'ESP32'} (${_lastPingMs}ms ping)';
        });
        _fetchCurrentState();
      } else {
        setState(() {
          _isConnected = false;
          _statusMessage = 'Server error: HTTP ${res.statusCode}';
        });
      }
    } catch (e) {
      setState(() {
        _isConnected = false;
        _statusMessage = 'Connection failed: ${e.toString()}';
      });
    }
  }

  Future<void> _fetchCurrentState() async {
    try {
      final res = await http
          .get(Uri.parse('$_baseUrl/api/latest'))
          .timeout(const Duration(seconds: 2));
      if (res.statusCode == 200 && res.body != 'null') {
        final data = jsonDecode(res.body);
        final presence = data['presence'];
        final spatial = data['spatial'];
        if (mounted) {
          setState(() {
            if (!_isOverrideActive && presence != null) {
              _peopleCount = presence['estimatedPeople'] ?? _peopleCount;
              _activityState = presence['activityState'] ?? _activityState;
            }
            if (spatial != null) {
              if (spatial['activeZone'] != null) {
                _activeZone = spatial['activeZone'];
              }
              if (spatial['disturbanceLevel'] != null) {
                _disturbanceLevel =
                    (spatial['disturbanceLevel'] as num).toDouble();
              }
              if (spatial['heatmap'] is List) {
                final list = spatial['heatmap'] as List;
                _hotZones = list
                    .map((h) => h['zone']?.toString() ?? '')
                    .where((z) => z.isNotEmpty)
                    .toList();
              }
            }
          });
        }
      }
    } catch (_) {}
  }

  Future<void> _sendDisturbance(double level) async {
    setState(() {
      _disturbanceLevel = level;
      _isOverrideActive = true;
    });
    try {
      await http
          .post(
            Uri.parse('$_baseUrl/api/override/disturbance'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'level': (level * 100).round()}),
          )
          .timeout(const Duration(seconds: 2));
    } catch (_) {}
  }

  Future<void> _tapHeatZone(String zone) async {
    setState(() {
      _activeZone = zone;
      if (!_hotZones.contains(zone)) _hotZones.add(zone);
      _isOverrideActive = true;
    });
    try {
      final res = await http
          .post(
            Uri.parse('$_baseUrl/api/override/heatmap'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'action': 'add', 'zone': zone}),
          )
          .timeout(const Duration(seconds: 2));
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data['count'] != null) {
          setState(() {
            _peopleCount = data['count'];
            _statusMessage = 'Added Heatspot in $zone (Total $_peopleCount)';
          });
        }
      }
    } catch (_) {}
  }

  Future<void> _clearHeatmap() async {
    setState(() {
      _hotZones.clear();
      _statusMessage = 'Cleared all heatmap hotspots';
    });
    try {
      await http
          .post(
            Uri.parse('$_baseUrl/api/override/heatmap'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'action': 'clear'}),
          )
          .timeout(const Duration(seconds: 2));
    } catch (_) {}
  }

  Future<void> _sendOverride({
    required int count,
    String? zone,
    String? activity,
    int? bpm,
  }) async {
    setState(() {
      _peopleCount = count;
      if (zone != null) _activeZone = zone;
      if (activity != null) _activityState = activity;
      if (bpm != null) _breathingBpm = bpm;
      _isOverrideActive = true;
    });

    try {
      final res = await http
          .post(
            Uri.parse('$_baseUrl/api/override/set'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'count': count,
              'zone': _activeZone,
              'activity': _activityState,
              'bpm': _breathingBpm,
            }),
          )
          .timeout(const Duration(seconds: 3));

      if (res.statusCode == 200) {
        setState(() {
          _statusMessage = 'Website updated: $count People in Zone $_activeZone';
        });
      } else {
        setState(() {
          _statusMessage = 'Update error: HTTP ${res.statusCode}';
        });
      }
    } catch (e) {
      setState(() {
        _statusMessage = 'Send failed: ${e.toString()}';
      });
    }
  }

  Future<void> _resetToHardware() async {
    try {
      final res = await http
          .post(Uri.parse('$_baseUrl/api/override/reset'))
          .timeout(const Duration(seconds: 3));
      if (res.statusCode == 200) {
        setState(() {
          _isOverrideActive = false;
          _statusMessage = 'Returned to Live ESP32 Hardware CSI mode';
        });
        _fetchCurrentState();
      }
    } catch (e) {
      setState(() {
        _statusMessage = 'Reset failed: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    const lime = Color(0xFFC8F36C);
    const amber = Color(0xFFF2BF6B);
    const cardBg = Color(0xFF131815);
    const borderCol = Color(0xFF26332A);

    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F1411),
        elevation: 0,
        title: Row(
          children: [
            Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(
                color: _isConnected ? lime : Colors.redAccent,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: (_isConnected ? lime : Colors.redAccent)
                        .withValues(alpha: 0.5),
                    blurRadius: 8,
                    spreadRadius: 2,
                  )
                ],
              ),
            ),
            const SizedBox(width: 10),
            const Text(
              'ResQ-Atlas Remote',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                letterSpacing: 1.1,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, size: 20),
            onPressed: _checkConnection,
            tooltip: 'Re-check Connection',
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // 1. Connection Card
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: cardBg,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: borderCol),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'LAPTOP WI-FI / LAN CONNECTION',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF75867C),
                          letterSpacing: 1.2,
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: _isConnected
                              ? lime.withValues(alpha: 0.15)
                              : Colors.red.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(4),
                          border: Border.all(
                            color: _isConnected
                                ? lime.withValues(alpha: 0.5)
                                : Colors.red.withValues(alpha: 0.5),
                          ),
                        ),
                        child: Text(
                          _isConnected
                              ? 'ONLINE (${_lastPingMs ?? 0}ms)'
                              : 'OFFLINE',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: _isConnected ? lime : Colors.redAccent,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _hostController,
                          decoration: InputDecoration(
                            isDense: true,
                            hintText: 'e.g. 10.13.181.190:4175',
                            contentPadding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 10),
                            filled: true,
                            fillColor: const Color(0xFF1B221E),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(6),
                              borderSide: const BorderSide(color: borderCol),
                            ),
                          ),
                          style: const TextStyle(fontSize: 13),
                        ),
                      ),
                      const SizedBox(width: 8),
                      ElevatedButton(
                        onPressed: _checkConnection,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: lime,
                          foregroundColor: const Color(0xFF141916),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 14, vertical: 11),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(6),
                          ),
                        ),
                        child: const Text('Connect',
                            style: TextStyle(fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _statusMessage,
                    style: TextStyle(
                      fontSize: 11,
                      color: _isConnected ? lime : const Color(0xFF9EABA2),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // 2. People Count Controller (Huge Counter + Buttons)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
              decoration: BoxDecoration(
                color: cardBg,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: _isOverrideActive
                      ? amber.withValues(alpha: 0.8)
                      : borderCol,
                  width: _isOverrideActive ? 1.5 : 1.0,
                ),
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'PEOPLE COUNT CONTROL',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF88998F),
                          letterSpacing: 1.2,
                        ),
                      ),
                      if (_isOverrideActive)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: amber.withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Text(
                            'OVERRIDE ACTIVE',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                              color: amber,
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  // Big display number
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      // Decrease button
                      IconButton.filled(
                        iconSize: 32,
                        icon: const Icon(Icons.remove),
                        style: IconButton.styleFrom(
                          backgroundColor: const Color(0xFF222B25),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.all(16),
                        ),
                        onPressed: () {
                          if (_peopleCount > 0) {
                            _sendOverride(count: _peopleCount - 1);
                          }
                        },
                      ),
                      const SizedBox(width: 28),
                      Column(
                        children: [
                          Text(
                            '$_peopleCount',
                            style: TextStyle(
                              fontSize: _peopleCount >= 100 ? 50 : 68,
                              fontWeight: FontWeight.w900,
                              color: _peopleCount > 0 ? amber : Colors.white70,
                              height: 1.0,
                            ),
                          ),
                          Text(
                            _peopleCount == 1 ? 'PERSON' : 'PEOPLE',
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 2.0,
                              color: Color(0xFF88998F),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(width: 28),
                      // Increase button
                      IconButton.filled(
                        iconSize: 32,
                        icon: const Icon(Icons.add),
                        style: IconButton.styleFrom(
                          backgroundColor: lime,
                          foregroundColor: const Color(0xFF141916),
                          padding: const EdgeInsets.all(16),
                        ),
                        onPressed: () {
                          _sendOverride(count: _peopleCount + 1);
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  // Smooth People Count Override Slider
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: Column(
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text(
                              'PEOPLE COUNT SLIDER',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFF75867C),
                                letterSpacing: 1.0,
                              ),
                            ),
                            Text(
                              '$_peopleCount People',
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: amber,
                              ),
                            ),
                          ],
                        ),
                        SliderTheme(
                          data: SliderTheme.of(context).copyWith(
                            activeTrackColor: lime,
                            inactiveTrackColor: const Color(0xFF222B25),
                            thumbColor: lime,
                            overlayColor: lime.withValues(alpha: 0.2),
                          ),
                          child: Slider(
                            value: _peopleCount.toDouble().clamp(0.0, 200.0),
                            min: 0.0,
                            max: 200.0,
                            divisions: 200,
                            onChanged: (val) {
                              _sendOverride(count: val.round());
                            },
                          ),
                        ),
                        const Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('0 (Quiet)',
                                style: TextStyle(
                                    fontSize: 9, color: Color(0xFF6E8074))),
                            Text('50',
                                style: TextStyle(
                                    fontSize: 9, color: Color(0xFF6E8074))),
                            Text('100',
                                style: TextStyle(
                                    fontSize: 9, color: Color(0xFF6E8074))),
                            Text('150',
                                style: TextStyle(
                                    fontSize: 9, color: Color(0xFF6E8074))),
                            Text('200+ (Hall)',
                                style: TextStyle(
                                    fontSize: 9, color: Color(0xFF6E8074))),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  // Quick step increment chips
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      OutlinedButton(
                        onPressed: () {
                          if (_peopleCount >= 10) {
                            _sendOverride(count: _peopleCount - 10);
                          } else if (_peopleCount > 0) {
                            _sendOverride(count: 0);
                          }
                        },
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white70,
                          side: const BorderSide(color: borderCol),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 6),
                        ),
                        child:
                            const Text('-10', style: TextStyle(fontSize: 12)),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton(
                        onPressed: () =>
                            _sendOverride(count: _peopleCount + 5),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: lime,
                          side: const BorderSide(color: borderCol),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 6),
                        ),
                        child:
                            const Text('+5', style: TextStyle(fontSize: 12)),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton(
                        onPressed: () =>
                            _sendOverride(count: _peopleCount + 10),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: lime,
                          side: const BorderSide(color: borderCol),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 6),
                        ),
                        child:
                            const Text('+10', style: TextStyle(fontSize: 12)),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton(
                        onPressed: () =>
                            _sendOverride(count: _peopleCount + 50),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: lime,
                          side: const BorderSide(color: borderCol),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 6),
                        ),
                        child:
                            const Text('+50', style: TextStyle(fontSize: 12)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  // Direct Input Number Row
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _customCountController,
                          keyboardType: TextInputType.number,
                          decoration: InputDecoration(
                            isDense: true,
                            hintText: 'Type exact number (e.g. 4)...',
                            contentPadding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 10),
                            filled: true,
                            fillColor: const Color(0xFF1B221E),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(6),
                              borderSide: const BorderSide(color: borderCol),
                            ),
                          ),
                          style: const TextStyle(fontSize: 13),
                        ),
                      ),
                      const SizedBox(width: 8),
                      ElevatedButton(
                        onPressed: () {
                          final val = int.tryParse(
                              _customCountController.text.trim());
                          if (val != null) {
                            _sendOverride(count: val);
                            _customCountController.clear();
                          }
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: amber,
                          foregroundColor: const Color(0xFF221606),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 14, vertical: 11),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(6),
                          ),
                        ),
                        child: const Text('Set Number',
                            style: TextStyle(fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // 3. Quick Action Presets
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: cardBg,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: borderCol),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'QUICK DEMO PRESETS',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF75867C),
                      letterSpacing: 1.2,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _presetButton('0 People (Clear)', 0, 'QUIET'),
                      _presetButton('1 Survivor', 1, 'BREATHING_ONLY'),
                      _presetButton('2 Survivors', 2, 'ACTIVE_MOVEMENT'),
                      _presetButton('3 People (Moving)', 3, 'ACTIVE_MOVEMENT'),
                      _presetButton('4 People (Group)', 4, 'ACTIVE_MOVEMENT'),
                      _presetButton('10 Rescue Group', 10, 'ACTIVE_MOVEMENT'),
                      _presetButton('50 Crowd', 50, 'ACTIVE_MOVEMENT'),
                      _presetButton('120 Hall Crowd', 120, 'ACTIVE_MOVEMENT'),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // 4. Room Zone Selector (3x3 Grid)
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: cardBg,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: borderCol),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'RF DISTURBANCE & MOTION SLIDER',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF75867C),
                          letterSpacing: 1.2,
                        ),
                      ),
                      Text(
                        '${(_disturbanceLevel * 100).round()}%',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: lime,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  SliderTheme(
                    data: SliderTheme.of(context).copyWith(
                      activeTrackColor: amber,
                      inactiveTrackColor: const Color(0xFF222B25),
                      thumbColor: amber,
                      overlayColor: amber.withValues(alpha: 0.2),
                    ),
                    child: Slider(
                      value: _disturbanceLevel,
                      min: 0.05,
                      max: 1.0,
                      divisions: 19,
                      onChanged: (val) {
                        _sendDisturbance(val);
                      },
                    ),
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      OutlinedButton(
                        onPressed: () {
                          final next = (_disturbanceLevel - 0.1).clamp(0.05, 1.0);
                          _sendDisturbance(next);
                        },
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white70,
                          side: const BorderSide(color: borderCol),
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        ),
                        child: const Text('−10% Disturbance', style: TextStyle(fontSize: 11)),
                      ),
                      OutlinedButton(
                        onPressed: () {
                          final next = (_disturbanceLevel + 0.1).clamp(0.05, 1.0);
                          _sendDisturbance(next);
                        },
                        style: OutlinedButton.styleFrom(
                          foregroundColor: lime,
                          side: const BorderSide(color: borderCol),
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        ),
                        child: const Text('+10% Disturbance', style: TextStyle(fontSize: 11)),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // 4. Room Heatmap Grid Card (Tap to Add Heatspot)
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: cardBg,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: borderCol),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'CSI HEATMAP (TAP TO ADD HEAT)',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF75867C),
                          letterSpacing: 1.2,
                        ),
                      ),
                      TextButton(
                        onPressed: _clearHeatmap,
                        style: TextButton.styleFrom(
                          foregroundColor: const Color(0xFFFF6B6B),
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        ),
                        child: const Text('Clear Heat', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Tap any zone below to generate an RF thermal disturbance on the radar:',
                    style: TextStyle(fontSize: 10, color: Color(0xFF6E8074)),
                  ),
                  const SizedBox(height: 10),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 3,
                      crossAxisSpacing: 8,
                      mainAxisSpacing: 8,
                      childAspectRatio: 2.2,
                    ),
                    itemCount: _zones.length,
                    itemBuilder: (context, index) {
                      final zone = _zones[index];
                      final isSelected = _activeZone == zone;
                      final isHot = _hotZones.contains(zone);
                      return InkWell(
                        onTap: () {
                          _tapHeatZone(zone);
                        },
                        child: Container(
                          decoration: BoxDecoration(
                            color: isHot
                                ? const Color(0xFF4A2508)
                                : isSelected
                                    ? amber.withValues(alpha: 0.2)
                                    : const Color(0xFF1B221E),
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(
                              color: isHot
                                  ? const Color(0xFFFF7A00)
                                  : isSelected
                                      ? amber
                                      : borderCol,
                              width: (isHot || isSelected) ? 1.5 : 1.0,
                            ),
                          ),
                          alignment: Alignment.center,
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              if (isHot)
                                const Icon(Icons.local_fire_department,
                                    size: 14, color: Color(0xFFFF7A00)),
                              Text(
                                zone,
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.bold,
                                  color: isHot
                                      ? const Color(0xFFFF7A00)
                                      : isSelected
                                          ? amber
                                          : Colors.white70,
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // 5. Activity State Selector
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: cardBg,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: borderCol),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'SURVIVOR ACTIVITY STATE',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF75867C),
                      letterSpacing: 1.2,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _activityChip('ACTIVE_MOVEMENT', 'Active Movement'),
                      _activityChip('BREATHING_ONLY', 'Breathing Only'),
                      _activityChip('STATIONARY', 'Stationary'),
                      _activityChip('QUIET', 'Quiet / Empty'),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 20),

            // 6. Reset Button
            ElevatedButton.icon(
              icon: const Icon(Icons.settings_backup_restore, size: 18),
              label: const Text('Return to Pure ESP32 Hardware CSI'),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF222B25),
                foregroundColor: const Color(0xFFA5B8AD),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                  side: const BorderSide(color: borderCol),
                ),
              ),
              onPressed: _resetToHardware,
            ),

            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _presetButton(String label, int count, String activity) {
    const amber = Color(0xFFF2BF6B);
    final isCurrent = _isOverrideActive && _peopleCount == count;
    return OutlinedButton(
      style: OutlinedButton.styleFrom(
        foregroundColor: isCurrent ? amber : Colors.white70,
        backgroundColor:
            isCurrent ? amber.withValues(alpha: 0.15) : const Color(0xFF1B221E),
        side: BorderSide(
          color: isCurrent ? amber : const Color(0xFF26332A),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
      ),
      onPressed: () {
        _sendOverride(count: count, activity: activity);
      },
      child: Text(label, style: const TextStyle(fontSize: 12)),
    );
  }

  Widget _activityChip(String code, String label) {
    const lime = Color(0xFFC8F36C);
    final isSelected = _activityState == code;
    return ChoiceChip(
      label: Text(label),
      selected: isSelected,
      selectedColor: lime.withValues(alpha: 0.2),
      backgroundColor: const Color(0xFF1B221E),
      labelStyle: TextStyle(
        fontSize: 12,
        color: isSelected ? lime : Colors.white70,
        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
      ),
      side: BorderSide(
        color: isSelected ? lime : const Color(0xFF26332A),
      ),
      onSelected: (val) {
        if (val) {
          _sendOverride(count: _peopleCount, activity: code);
        }
      },
    );
  }
}
