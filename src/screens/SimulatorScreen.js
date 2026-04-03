import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  PanResponder, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { generateSceneHTML } from '../utils/scene';
import {
  calcSunPosition, CITIES, SEASON_PRESETS,
  formatHour, MONTH_LABELS,
} from '../utils/sunCalc';

const SCENE_HTML = generateSceneHTML();
const CITY_KEYS = Object.keys(CITIES);

const PRESETS = [
  { key: 'taipei101', label: '台北101', icon: '🏙', mainH: 38 },
  { key: 'ntust',     label: '台科大',  icon: '🎓', mainH: 24 },
  { key: 'indoor',    label: '室內採光', icon: '🏠', mainH: 3  },
  { key: 'custom',    label: '自建',    icon: '🔨', mainH: 20 },
];

const ORIENTATIONS = [
  { key: 'south', label: '南向' },
  { key: 'east',  label: '東向' },
  { key: 'west',  label: '西向' },
  { key: 'north', label: '北向' },
];

// ── Custom Slider ──────────────────────────────────────────────────────────────
function CustomSlider({ value, min, max, onValueChange, color }) {
  const trackWidth = useRef(0);
  const trackPageX = useRef(0);
  const viewRef    = useRef(null);
  const cbRef = useRef(onValueChange);
  const minRef = useRef(min);
  const maxRef = useRef(max);
  cbRef.current = onValueChange;
  minRef.current = min;
  maxRef.current = max;
  const pct = ((value - min) / (max - min)) * 100;

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: (e) => {
      const x = Math.max(0, Math.min(e.nativeEvent.pageX - trackPageX.current, trackWidth.current));
      cbRef.current(minRef.current + (x / trackWidth.current) * (maxRef.current - minRef.current));
    },
    onPanResponderMove: (e) => {
      const x = Math.max(0, Math.min(e.nativeEvent.pageX - trackPageX.current, trackWidth.current));
      cbRef.current(minRef.current + (x / trackWidth.current) * (maxRef.current - minRef.current));
    },
  })).current;

  return (
    <View
      ref={viewRef}
      style={styles.sliderTrack}
      onLayout={() => {
        viewRef.current?.measure((_fx, _fy, width, _h, px) => {
          trackWidth.current = width;
          trackPageX.current = px;
        });
      }}
      {...panResponder.panHandlers}
    >
      <View style={styles.sliderTrackLine} />
      <View style={[styles.sliderFill, { width: `${pct}%`, backgroundColor: color }]} />
      <View style={[styles.sliderThumb, { left: `${pct}%`, backgroundColor: color,
        transform: [{ translateX: -10 }] }]} />
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function SimulatorScreen() {
  const insets = useSafeAreaInsets();
  const [hour,        setHour]        = useState(10);
  const [month,       setMonth]       = useState(6);
  const [day,         setDay]         = useState(15);
  const [cityKey,     setCityKey]     = useState('taipei');
  const [preset,      setPreset]      = useState('taipei101');
  const [orientation, setOrientation] = useState('south');
  const [customBuildings, setCustomBuildings] = useState([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [compassAngle, setCompassAngle] = useState(0);
  const [saveMsg, setSaveMsg] = useState('');
  const [transparentIds, setTransparentIds] = useState(new Set());
  const playRef = useRef(null);
  const webViewRef = useRef(null);
  const isWebViewReady = useRef(false);

  const city    = CITIES[cityKey];
  const sun     = calcSunPosition(hour, month, day, city.lat);
  const mainH   = PRESETS.find(p => p.key === preset)?.mainH ?? 38;

  // 陰影長度 / 光線進深計算
  const shadowLen = sun.isAboveHorizon && sun.altitude > 0.5
    ? (mainH / Math.tan(sun.altitude * Math.PI / 180)).toFixed(1)
    : null;
  // 室內：遮陽板高度(2.7m) / tan(altitude) = 光線進深
  // 需檢查太陽方位角與窗戶法線夾角 < 90° 才有直射光
  const orientAzMap = { south: 180, east: 90, west: 270, north: 0 };
  const winNormalAz = orientAzMap[orientation] || 180;
  const azDiff = Math.abs(sun.azimuth - winNormalAz) > 180
    ? 360 - Math.abs(sun.azimuth - winNormalAz)
    : Math.abs(sun.azimuth - winNormalAz);
  const canEnterWindow = azDiff < 70;
  const lightPenetration = preset === 'indoor' && sun.isAboveHorizon && sun.altitude > 0.5 && canEnterWindow
    ? (2.7 / Math.tan(sun.altitude * Math.PI / 180)).toFixed(1)
    : null;

  // 傳送太陽狀態給 WebView
  const pushSun = useCallback(() => {
    if (!isWebViewReady.current) return;
    const msg = JSON.stringify({
      azimuth: sun.azimuth,
      altitude: sun.altitude,
      month,
      lat: city.lat,
      hour,
      day,
      preset,
      orientation: preset === 'indoor' ? orientation : undefined,
    }).replace(/'/g, "\\'");
    webViewRef.current?.injectJavaScript(
      `window.dispatchEvent(new MessageEvent('message',{data:'${msg}'}));true;`
    );
  }, [sun.azimuth, sun.altitude, month, city.lat, hour, day, preset, orientation]);

  useEffect(() => { pushSun(); }, [pushSun]);

  // Push custom buildings to WebView
  const pushBuildings = useCallback(() => {
    if (!isWebViewReady.current || preset !== 'custom') return;
    const msg = JSON.stringify({ action: 'setBuildings', buildings: customBuildings }).replace(/'/g, "\\'");
    webViewRef.current?.injectJavaScript(
      `window.dispatchEvent(new MessageEvent('message',{data:'${msg}'}));true;`
    );
  }, [customBuildings, preset]);

  useEffect(() => { pushBuildings(); }, [pushBuildings]);

  // Push selected building
  useEffect(() => {
    if (!isWebViewReady.current) return;
    const msg = JSON.stringify({ action: 'selectBuilding', id: selectedBuildingId }).replace(/'/g, "\\'");
    webViewRef.current?.injectJavaScript(
      `window.dispatchEvent(new MessageEvent('message',{data:'${msg}'}));true;`
    );
  }, [selectedBuildingId]);

  // Time animation
  const togglePlay = useCallback(() => {
    if (playing) {
      clearInterval(playRef.current);
      playRef.current = null;
      setPlaying(false);
    } else {
      setPlaying(true);
      playRef.current = setInterval(() => {
        setHour(h => {
          const next = h + 0.25;
          return next > 19 ? 5 : next;
        });
      }, 150);
    }
  }, [playing]);

  useEffect(() => {
    return () => {
      if (playRef.current) clearInterval(playRef.current);
    };
  }, []);

  // WebView onMessage handler
  const handleWebViewMessage = useCallback((event) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'groundTap' && preset === 'custom') {
        const newBuilding = {
          id: 'b' + Date.now(),
          x: msg.x ?? 0,
          z: msg.z ?? 0,
          w: 10,
          d: 10,
          h: 15,
        };
        setCustomBuildings(prev => [...prev, newBuilding]);
        setSelectedBuildingId(newBuilding.id);
      } else if (msg.type === 'buildingTap') {
        setSelectedBuildingId(msg.id);
      } else if (msg.type === 'camera') {
        setCompassAngle(msg.theta);
      } else if (msg.type === 'saved') {
        setSaveMsg('已儲存 ✓');
        setTimeout(() => setSaveMsg(''), 2000);
      } else if (msg.type === 'loaded') {
        setCustomBuildings(msg.buildings);
        if (msg.buildings.length > 0) {
          setSelectedBuildingId(msg.buildings[0].id);
        }
      } else if (msg.type === 'transparencyChanged') {
        setTransparentIds(prev => {
          const next = new Set(prev);
          if (msg.transparent) {
            next.add(msg.id);
          } else {
            next.delete(msg.id);
          }
          return next;
        });
      } else if (msg.type === 'analysisComplete') {
        setAnalyzing(false);
        setAnalysisResult(msg.maxHours);
      }
    } catch (e) {
      // ignore non-JSON messages
    }
  }, [preset]);

  // Update a custom building property
  const updateBuilding = useCallback((id, key, value) => {
    setCustomBuildings(prev =>
      prev.map(b => (b.id === id ? { ...b, [key]: value } : b))
    );
  }, []);

  const addBuilding = useCallback(() => {
    const newB = { id: 'b' + Date.now(), x: 0, z: 0, w: 10, d: 10, h: 15 };
    setCustomBuildings(prev => [...prev, newB]);
    setSelectedBuildingId(newB.id);
  }, []);

  const deleteBuilding = useCallback((id) => {
    setCustomBuildings(prev => prev.filter(b => b.id !== id));
    setSelectedBuildingId(prev => (prev === id ? null : prev));
  }, []);

  const saveBuildings = useCallback(() => {
    const msg = JSON.stringify({ action: 'saveBuildings', buildings: customBuildings }).replace(/'/g, "\\'");
    webViewRef.current?.injectJavaScript(
      "window.dispatchEvent(new MessageEvent('message',{data:'" + msg + "'}));true;"
    );
  }, [customBuildings]);

  const loadBuildings = useCallback(() => {
    webViewRef.current?.injectJavaScript(
      "window.dispatchEvent(new MessageEvent('message',{data:'{\"action\":\"loadBuildings\"}'}));true;"
    );
  }, []);

  const toggleTransparency = useCallback(() => {
    if (!selectedBuildingId) return;
    const msg = JSON.stringify({ action: 'toggleTransparency', id: selectedBuildingId }).replace(/'/g, "\\'");
    webViewRef.current?.injectJavaScript(
      "window.dispatchEvent(new MessageEvent('message',{data:'" + msg + "'}));true;"
    );
  }, [selectedBuildingId]);

  // 日照分析
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);

  const runAnalysis = useCallback(() => {
    setAnalyzing(true);
    const msg = JSON.stringify({ action: 'analyzeSunlight', lat: city.lat }).replace(/'/g, "\\'");
    webViewRef.current?.injectJavaScript(
      "window.dispatchEvent(new MessageEvent('message',{data:'" + msg + "'}));true;"
    );
  }, [city.lat]);

  const clearAnalysis = useCallback(() => {
    setAnalysisResult(null);
    webViewRef.current?.injectJavaScript(
      "window.dispatchEvent(new MessageEvent('message',{data:'{\"action\":\"clearAnalysis\"}'}));true;"
    );
  }, []);

  // 間距計算
  const winterSolsticeAlt = useMemo(() => {
    const s = calcSunPosition(12, 12, 21, city.lat);
    return s.altitude;
  }, [city.lat]);

  const selectedSpacing = useMemo(() => {
    const selB = customBuildings.find(b => b.id === selectedBuildingId);
    if (!selB || winterSolsticeAlt <= 0) return null;
    return selB.h / Math.tan(winterSolsticeAlt * Math.PI / 180);
  }, [selectedBuildingId, customBuildings, winterSolsticeAlt]);

  useEffect(() => {
    if (preset !== 'custom' || !selectedBuildingId) return;
    const selB = customBuildings.find(b => b.id === selectedBuildingId);
    if (!selB || !selectedSpacing) return;
    const msg = JSON.stringify({ action: 'showSpacing', x: selB.x, z: selB.z, w: selB.w, d: selB.d, spacing: Math.round(selectedSpacing * 10) / 10 }).replace(/'/g, "\\'");
    webViewRef.current?.injectJavaScript(
      "window.dispatchEvent(new MessageEvent('message',{data:'" + msg + "'}));true;"
    );
    return () => {
      webViewRef.current?.injectJavaScript(
        "window.dispatchEvent(new MessageEvent('message',{data:'{\"action\":\"clearSpacing\"}'}));true;"
      );
    };
  }, [selectedBuildingId, selectedSpacing, customBuildings, preset]);

  // HUD 顏色
  const hudColor = sun.isAboveHorizon
    ? (sun.altitude > 30 ? '#FFD54F' : '#FF9050')
    : '#607D8B';

  return (
    <View style={styles.root}>

      {/* ── 3D 場景 ─────────────────────────────────────────── */}
      <View style={styles.sceneWrap}>
        <WebView
          ref={webViewRef}
          source={{ html: SCENE_HTML }}
          style={styles.webview}
          scrollEnabled={false}
          bounces={false}
          javaScriptEnabled
          originWhitelist={['*']}
          onLoad={() => { isWebViewReady.current = true; pushSun(); pushBuildings(); }}
          onMessage={handleWebViewMessage}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
        />


        {/* ── HUD ─────────────────────────────────────────────── */}
        <View style={[styles.hud, { top: insets.top + 8 }]} pointerEvents="none">
          {[
            { val: sun.isAboveHorizon ? `${sun.altitude.toFixed(1)}°` : '日落', lbl: '高度角' },
            { val: sun.dirLabel,                                                  lbl: `${sun.azimuth.toFixed(0)}°` },
            { val: formatHour(parseFloat(sun.sunrise)),                           lbl: '日出' },
            { val: formatHour(parseFloat(sun.sunset)),                            lbl: '日落' },
          ].map(({ val, lbl }) => (
            <View key={lbl} style={[styles.hudCard, { borderColor: hudColor + '50' }]}>
              <Text style={[styles.hudVal, { color: hudColor }]}>{val}</Text>
              <Text style={styles.hudLbl}>{lbl}</Text>
            </View>
          ))}
        </View>

        {/* ── 羅盤 ─────────────────────────────────────────────── */}
        <View style={styles.compass} pointerEvents="none">
          <View style={[styles.compassInner, { transform: [{ rotate: `${(-compassAngle * 180 / Math.PI).toFixed(1)}deg` }] }]}>
            <Text style={styles.compassN}>N</Text>
            <View style={styles.compassCross}>
              <Text style={styles.compassW}>W</Text>
              <View style={styles.compassDot} />
              <Text style={styles.compassE}>E</Text>
            </View>
            <Text style={styles.compassS}>S</Text>
          </View>
        </View>
      </View>

      {/* ── 控制面板 ─────────────────────────────────────────── */}
      <View style={styles.panel}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.panelContent}>

          {/* 場景切換 */}
          <View style={styles.presetRow}>
            {PRESETS.map(p => (
              <TouchableOpacity key={p.key}
                style={[styles.presetBtn, preset === p.key && styles.presetBtnOn]}
                onPress={() => setPreset(p.key)}>
                <Text style={styles.presetIcon}>{p.icon}</Text>
                <Text style={[styles.presetLabel, preset === p.key && styles.presetLabelOn]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 室內方位（只在 indoor 顯示）*/}
          {preset === 'indoor' && (
            <View style={styles.section}>
              <View style={styles.sectionRow}>
                <Ionicons name="compass-outline" size={14} color="#FFA726" />
                <Text style={styles.sectionLabel}>窗戶朝向</Text>
              </View>
              <View style={styles.orientRow}>
                {ORIENTATIONS.map(o => (
                  <TouchableOpacity key={o.key}
                    style={[styles.orientBtn, orientation === o.key && styles.orientBtnOn]}
                    onPress={() => setOrientation(o.key)}>
                    <Text style={[styles.orientTxt, orientation === o.key && styles.orientTxtOn]}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* 時間 */}
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Ionicons name="sunny-outline" size={14} color="#FFD54F" />
              <Text style={styles.sectionLabel}>時間</Text>
              <Text style={styles.sectionVal}>{formatHour(hour)}</Text>
              <TouchableOpacity onPress={togglePlay} style={styles.playBtn}>
                <Ionicons name={playing ? 'pause' : 'play'} size={16} color="#FFD54F" />
              </TouchableOpacity>
            </View>
            <CustomSlider value={hour} min={5} max={19} color="#FFD54F"
              onValueChange={v => setHour(Math.round(v * 2) / 2)} />
            <View style={styles.markers}>
              {['06','09','12','15','18'].map(t => (
                <Text key={t} style={styles.markerText}>{t}:00</Text>
              ))}
            </View>
          </View>

          {/* 月份 */}
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Ionicons name="calendar-outline" size={14} color="#81C784" />
              <Text style={styles.sectionLabel}>月份</Text>
              <Text style={styles.sectionVal}>{MONTH_LABELS[month - 1]}</Text>
            </View>
            <CustomSlider value={month} min={1} max={12} color="#81C784"
              onValueChange={v => setMonth(Math.max(1, Math.min(12, Math.round(v))))} />
            <View style={styles.seasonRow}>
              {SEASON_PRESETS.map(s => (
                <TouchableOpacity key={s.label}
                  style={[styles.seasonBtn, month === s.month && styles.seasonBtnOn]}
                  onPress={() => setMonth(s.month)}>
                  <Text style={[styles.seasonTxt, month === s.month && styles.seasonTxtOn]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 城市 */}
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Ionicons name="location-outline" size={14} color="#4FC3F7" />
              <Text style={styles.sectionLabel}>城市</Text>
              <Text style={[styles.cityLat, { color: '#4FC3F7' }]}>
                {CITIES[cityKey].lat > 0
                  ? `${CITIES[cityKey].lat}°N`
                  : `${Math.abs(CITIES[cityKey].lat)}°S`}
              </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.cityRow}>
              {CITY_KEYS.map(k => (
                <TouchableOpacity key={k}
                  style={[styles.cityBtn, cityKey === k && styles.cityBtnOn,
                    CITIES[k].group === 'INT' && styles.cityBtnInt,
                    cityKey === k && CITIES[k].group === 'INT' && styles.cityBtnIntOn]}
                  onPress={() => setCityKey(k)}>
                  <Text style={[styles.cityName, cityKey === k && styles.cityNameOn]}>
                    {CITIES[k].name}
                  </Text>
                  <Text style={[styles.cityLat, cityKey === k && { color: '#4FC3F7' }]}>
                    {CITIES[k].lat > 0
                      ? `${CITIES[k].lat}°N`
                      : `${Math.abs(CITIES[k].lat)}°S`}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* 自訂建築面板（custom mode）*/}
          {preset === 'custom' && (
            <View style={styles.customPanel}>
              <View style={styles.customHeader}>
                <Text style={styles.customTitle}>自訂建築（{customBuildings.length}）</Text>
                <View style={{flexDirection:'row', gap: 6}}>
                  <TouchableOpacity style={styles.saveBtn} onPress={saveBuildings}>
                    <Text style={styles.saveBtnTxt}>💾</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveBtn} onPress={loadBuildings}>
                    <Text style={styles.saveBtnTxt}>📂</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.addBtn} onPress={addBuilding}>
                    <Text style={styles.addBtnTxt}>＋新增</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {saveMsg ? <Text style={{color:'#81C784',fontSize:11,textAlign:'center'}}>{saveMsg}</Text> : null}

              {/* Building chips */}
              <View style={styles.buildingChips}>
                {customBuildings.map((b, i) => (
                  <TouchableOpacity
                    key={b.id}
                    style={[styles.buildingChip, selectedBuildingId === b.id && styles.buildingChipOn]}
                    onPress={() => setSelectedBuildingId(b.id)}
                  >
                    <Text style={[styles.buildingChipTxt, selectedBuildingId === b.id && styles.buildingChipTxtOn]}>
                      建築 {i + 1}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Selected building editor */}
              {(() => {
                const selB = customBuildings.find(b => b.id === selectedBuildingId);
                if (!selB) return null;
                const selIdx = customBuildings.findIndex(b => b.id === selectedBuildingId);
                const sliders = [
                  { key: 'x', label: 'X位置', min: -80, max: 80, color: '#4FC3F7' },
                  { key: 'z', label: 'Z位置', min: -80, max: 80, color: '#4FC3F7' },
                  { key: 'w', label: '寬W',   min: 2,   max: 50, color: '#81C784' },
                  { key: 'd', label: '深D',   min: 2,   max: 50, color: '#81C784' },
                  { key: 'h', label: '高H',   min: 3,   max: 80, color: '#FFA726' },
                ];
                return (
                  <View style={styles.editorSection}>
                    <Text style={[styles.customTitle, { marginBottom: 4 }]}>建築 {selIdx + 1}</Text>
                    {sliders.map(s => (
                      <View key={s.key} style={{ gap: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Text style={styles.editorLabel}>{s.label}</Text>
                          <Text style={styles.editorVal}>{Math.round(selB[s.key])}m</Text>
                        </View>
                        <CustomSlider
                          value={selB[s.key]}
                          min={s.min}
                          max={s.max}
                          color={s.color}
                          onValueChange={v => updateBuilding(selB.id, s.key, Math.round(v))}
                        />
                      </View>
                    ))}
                    <View style={{flexDirection:'row', gap: 8, justifyContent:'flex-end'}}>
                      <TouchableOpacity style={styles.transBtn} onPress={toggleTransparency}>
                        <Text style={styles.transBtnTxt}>
                          {transparentIds.has(selB.id) ? '👁 實體' : '👻 透明'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteBuilding(selB.id)}>
                        <Text style={styles.deleteBtnTxt}>🗑 刪除</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })()}

            {/* 日照分析 + 間距計算 */}
            <View style={styles.analysisCard}>
              <Text style={styles.analysisTitle}>
                <Ionicons name="sunny-outline" size={13} color="#FFD54F" />  日照 / 間距分析
              </Text>
              <View style={{flexDirection:'row', gap: 8, marginBottom: 6}}>
                <TouchableOpacity
                  style={[styles.addBtn, {flex:1, justifyContent:'center'}]}
                  onPress={analyzing ? undefined : runAnalysis}>
                  <Text style={styles.addBtnTxt}>{analyzing ? '分析中...' : '☀️ 日照熱力圖'}</Text>
                </TouchableOpacity>
                {analysisResult && (
                  <TouchableOpacity style={[styles.deleteBtn, {borderColor:'#2A3A2A'}]} onPress={clearAnalysis}>
                    <Text style={[styles.deleteBtnTxt, {color:'#8A8A8A'}]}>清除</Text>
                  </TouchableOpacity>
                )}
              </View>
              {analysisResult && (
                <Text style={styles.analysisFormula}>
                  取冬至/春分/夏至/秋分四天平均，最高日照 {analysisResult} 小時/天
                </Text>
              )}
              {selectedSpacing && (
                <View style={{marginTop: 6}}>
                  <Text style={[styles.editorLabel, {marginBottom: 2}]}>
                    📏 冬至最小間距（{city.name} {winterSolsticeAlt.toFixed(1)}°）
                  </Text>
                  <Text style={[styles.analysisVal, {color:'#4FC3F7'}]}>
                    {selectedSpacing.toFixed(1)} m
                  </Text>
                  <Text style={styles.analysisFormula}>
                    = {customBuildings.find(b=>b.id===selectedBuildingId)?.h}m ÷ tan({winterSolsticeAlt.toFixed(1)}°)
                  </Text>
                </View>
              )}
            </View>
            </View>
          )}

          {/* 陰影/採光分析 */}
          {preset !== 'custom' && <View style={styles.analysisCard}>
            {preset === 'indoor' ? (
              <>
                <Text style={styles.analysisTitle}>
                  <Ionicons name="sunny-outline" size={13} color="#FFA726" />  室內採光分析（窗頂高 2.7m）
                </Text>
                {lightPenetration ? (
                  <View style={styles.analysisRow}>
                    <View style={styles.analysisStat}>
                      <Text style={[styles.analysisVal, { color: '#FFA726' }]}>{lightPenetration} m</Text>
                      <Text style={styles.analysisLbl}>光線進深</Text>
                    </View>
                    <View style={styles.analysisDivider} />
                    <View style={styles.analysisStat}>
                      <Text style={styles.analysisVal}>{sun.altitude.toFixed(1)}°</Text>
                      <Text style={styles.analysisLbl}>太陽高度</Text>
                    </View>
                    <View style={styles.analysisDivider} />
                    <View style={styles.analysisStat}>
                      <Text style={[styles.analysisVal, { fontSize: 13 }]}>
                        {parseFloat(lightPenetration) > 6 ? '深入' : parseFloat(lightPenetration) > 2 ? '適中' : '遮陽'}
                      </Text>
                      <Text style={styles.analysisLbl}>採光效果</Text>
                    </View>
                  </View>
                ) : (
                  <Text style={styles.analysisNight}>
                    {sun.isAboveHorizon ? '太陽角度過低' : `日出 ${formatHour(parseFloat(sun.sunrise))} · 日落 ${formatHour(parseFloat(sun.sunset))}`}
                  </Text>
                )}
                {lightPenetration && (
                  <Text style={styles.analysisFormula}>
                    陽光從窗頂(2.7m)射入：2.7 ÷ tan({sun.altitude.toFixed(1)}°) = {lightPenetration}m
                  </Text>
                )}
              </>
            ) : (
              <>
                <Text style={styles.analysisTitle}>
                  <Ionicons name="analytics-outline" size={13} color="#A5D6A7" />  陰影分析（主建物 {mainH}m）
                </Text>
                {shadowLen ? (
                  <View style={styles.analysisRow}>
                    <View style={styles.analysisStat}>
                      <Text style={styles.analysisVal}>{shadowLen} m</Text>
                      <Text style={styles.analysisLbl}>陰影長度</Text>
                    </View>
                    <View style={styles.analysisDivider} />
                    <View style={styles.analysisStat}>
                      <Text style={styles.analysisVal}>
                        {(parseFloat(shadowLen) / mainH).toFixed(2)} ×
                      </Text>
                      <Text style={styles.analysisLbl}>建物高倍率</Text>
                    </View>
                    <View style={styles.analysisDivider} />
                    <View style={styles.analysisStat}>
                      <Text style={styles.analysisVal}>{sun.altitude.toFixed(1)}°</Text>
                      <Text style={styles.analysisLbl}>太陽高度</Text>
                    </View>
                  </View>
                ) : (
                  <Text style={styles.analysisNight}>
                    {sun.isAboveHorizon ? '太陽角度過低' : `日出 ${formatHour(parseFloat(sun.sunrise))} · 日落 ${formatHour(parseFloat(sun.sunset))}`}
                  </Text>
                )}
                {shadowLen && (
                  <Text style={styles.analysisFormula}>
                    公式：{mainH}m ÷ tan({sun.altitude.toFixed(1)}°) = {shadowLen}m
                  </Text>
                )}
              </>
            )}
          </View>}

        </ScrollView>
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D1117' },

  sceneWrap: { flex: 1, position: 'relative' },
  webview: { flex: 1, backgroundColor: '#0D1117' },

  hud: {
    position: 'absolute', top: 10, left: 10, right: 10,
    flexDirection: 'row', justifyContent: 'center', gap: 7,
  },
  hudCard: {
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 9, paddingVertical: 5, alignItems: 'center', minWidth: 56,
  },
  hudVal: { fontSize: 14, fontWeight: '700' },
  hudLbl: { fontSize: 10, color: '#4A6A4A', marginTop: 1 },

  panel: {
    backgroundColor: '#0F180F', borderTopWidth: 1, borderTopColor: '#1A2A1A',
    maxHeight: 280,
  },
  panelContent: { padding: 14, gap: 12, paddingBottom: 24 },

  section: { gap: 7 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionLabel: { fontSize: 13, color: '#8AAA8A', flex: 1 },
  sectionVal: { fontSize: 13, fontWeight: '700', color: '#E0EEE0' },

  sliderTrack: {
    height: 28, borderRadius: 14, backgroundColor: 'transparent',
    position: 'relative', justifyContent: 'center', marginHorizontal: 2,
    paddingVertical: 12,
  },
  sliderFill: {
    position: 'absolute', left: 0, top: 12, height: 4, borderRadius: 2,
  },
  sliderThumb: {
    position: 'absolute', width: 20, height: 20, borderRadius: 10,
    top: 4, marginLeft: 0,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5, shadowRadius: 3, elevation: 4,
  },
  sliderTrackLine: {
    position: 'absolute', left: 0, right: 0, top: 12, height: 4,
    borderRadius: 2, backgroundColor: '#1E2E1E',
  },

  markers: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 1 },
  markerText: { fontSize: 9, color: '#2E4A2E' },

  seasonRow: { flexDirection: 'row', gap: 7 },
  seasonBtn: {
    flex: 1, paddingVertical: 5, borderRadius: 8, alignItems: 'center',
    backgroundColor: '#141E14', borderWidth: 1, borderColor: '#1E2E1E',
  },
  seasonBtnOn: { borderColor: '#4CAF50', backgroundColor: '#162416' },
  seasonTxt:   { fontSize: 12, color: '#5A7A5A' },
  seasonTxtOn: { color: '#81C784', fontWeight: '700' },

  cityRow: { flexDirection: 'row', gap: 6, paddingBottom: 2 },
  cityBtn: {
    paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8, alignItems: 'center',
    backgroundColor: '#141E14', borderWidth: 1, borderColor: '#1E2E1E', minWidth: 58,
  },
  cityBtnOn:    { borderColor: '#4FC3F7', backgroundColor: '#141E24' },
  cityBtnInt:   { backgroundColor: '#141420', borderColor: '#202030' },
  cityBtnIntOn: { borderColor: '#CE93D8', backgroundColor: '#1A1428' },
  cityName:   { fontSize: 12, color: '#8AAA8A', fontWeight: '600' },
  cityNameOn: { color: '#4FC3F7' },
  cityLat:    { fontSize: 9, color: '#2E4A2E', marginTop: 1 },

  analysisCard: {
    backgroundColor: '#101810', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: '#1E2E1E',
  },
  analysisTitle: { fontSize: 12, color: '#81C784', marginBottom: 10 },
  analysisRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  analysisStat:  { flex: 1, alignItems: 'center' },
  analysisVal:   { fontSize: 16, fontWeight: '800', color: '#E0EEE0' },
  analysisLbl:   { fontSize: 10, color: '#4A6A4A', marginTop: 2 },
  analysisDivider: { width: 1, height: 30, backgroundColor: '#1E2E1E' },
  analysisFormula: { fontSize: 10, color: '#3A5A3A', textAlign: 'center' },
  analysisNight:   { fontSize: 13, color: '#3A5A3A', textAlign: 'center', paddingVertical: 4 },

  // 場景切換
  presetRow: { flexDirection: 'row', gap: 5 },
  presetBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 3, paddingVertical: 7, paddingHorizontal: 2, borderRadius: 10,
    backgroundColor: '#141E14', borderWidth: 1, borderColor: '#1E2E1E',
  },
  presetBtnOn: { backgroundColor: '#1A2E28', borderColor: '#4CAF50' },
  presetIcon:  { fontSize: 14 },
  presetLabel: { fontSize: 11, color: '#5A7A5A', fontWeight: '600' },
  presetLabelOn: { color: '#81C784' },

  // 方位選擇
  orientRow: { flexDirection: 'row', gap: 7 },
  orientBtn: {
    flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center',
    backgroundColor: '#141A14', borderWidth: 1, borderColor: '#2A2010',
  },
  orientBtnOn: { backgroundColor: '#2A1E08', borderColor: '#FFA726' },
  orientTxt:   { fontSize: 13, color: '#7A6040', fontWeight: '600' },
  orientTxtOn: { color: '#FFA726' },

  // 羅盤
  compass: {
    position: 'absolute', bottom: 14, right: 14,
  },
  compassInner: {
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 36,
    width: 72, height: 72, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  compassN: { fontSize: 12, fontWeight: '800', color: '#FF6B6B', lineHeight: 14 },
  compassS: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.5)', lineHeight: 14 },
  compassCross: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  compassE: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  compassW: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  compassDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },

  // Play button
  playBtn: { padding: 4, marginLeft: 4 },

  // Custom building mode
  customPanel: { gap: 8 },
  customHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  customTitle: { fontSize: 13, color: '#FFA726', fontWeight: '700' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1A2E28', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: '#4CAF50' },
  addBtnTxt: { fontSize: 12, color: '#81C784', fontWeight: '600' },
  buildingChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  buildingChip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, backgroundColor: '#141E14', borderWidth: 1, borderColor: '#1E2E1E' },
  buildingChipOn: { borderColor: '#FFA726', backgroundColor: '#2A1E08' },
  buildingChipTxt: { fontSize: 11, color: '#8AAA8A' },
  buildingChipTxtOn: { color: '#FFA726' },
  editorSection: { backgroundColor: '#101810', borderRadius: 10, padding: 10, gap: 6, borderWidth: 1, borderColor: '#1E2E1E' },
  editorLabel: { fontSize: 11, color: '#6A8A6A' },
  editorVal: { fontSize: 12, color: '#E0EEE0', fontWeight: '700', minWidth: 40, textAlign: 'right' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#2A1414', borderWidth: 1, borderColor: '#4A2020' },
  deleteBtnTxt: { fontSize: 11, color: '#FF6B6B' },
  saveBtn: { backgroundColor: '#141E14', borderWidth: 1, borderColor: '#1E2E1E', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 8 },
  saveBtnTxt: { fontSize: 14 },
  transBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#141428', borderWidth: 1, borderColor: '#2A2A40' },
  transBtnTxt: { fontSize: 11, color: '#9090CC' },

  // Screenshot
  screenshotBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, padding: 6, zIndex: 20 },
});
