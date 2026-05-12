// src/components/BackgroundFilterPicker.tsx
//
// Bottom sheet to pick background blur levels and virtual backgrounds.
// Organised into two sections: BLUR and BACKGROUNDS.
// Blur options show an animated intensity preview.
// Virtual background options show a thumbnail of the image.

import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Image,
  Animated,
  Easing,
} from 'react-native';
import {
  BackgroundFilter,
  BackgroundFilterType,
  BACKGROUND_FILTERS,
} from '../hooks/useBackgroundFilter';

interface Props {
  visible: boolean;
  activeFilter: BackgroundFilterType;
  isApplying: boolean;
  error?: string | null;
  onSelect: (filter: BackgroundFilterType) => void;
  onClose: () => void;
}

// ─── Blur intensity preview bars ─────────────────────────────────────────────

function BlurBars({ type }: { type: BackgroundFilterType }) {
  const count =
    type === 'blur-light' ? 2 : type === 'blur-medium' ? 3 : 4;
  return (
    <View style={blurStyles.bars}>
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={[
            blurStyles.bar,
            { opacity: i <= count ? 1 : 0.15 },
            i <= count && {
              backgroundColor:
                count === 4 ? '#818cf8' : count === 3 ? '#6366f1' : '#a5b4fc',
            },
          ]}
        />
      ))}
    </View>
  );
}

const blurStyles = StyleSheet.create({
  bars: {
    flexDirection: 'row',
    gap: 3,
    alignItems: 'flex-end',
    height: 20,
  },
  bar: {
    width: 5,
    borderRadius: 3,
    backgroundColor: '#4f46e5',
  },
});

// ─── Single filter option ─────────────────────────────────────────────────────

interface OptionProps {
  filter: BackgroundFilter;
  isActive: boolean;
  isApplying: boolean;
  onPress: () => void;
}

function FilterOption({ filter, isActive, isApplying, onPress }: OptionProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const glow  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: 1200, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
          Animated.timing(glow, { toValue: 0, duration: 1200, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        ]),
      ).start();
    } else {
      glow.setValue(0);
    }
  }, [isActive]);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }),
    ]).start();
    onPress();
  };

  const isVirtual = filter.category === 'virtual';
  const isBlur    = filter.category === 'blur';

  return (
    <Animated.View style={[{ transform: [{ scale }] }]}>
      <TouchableOpacity
        style={[
          styles.option,
          isVirtual && styles.optionVirtual,
          isActive && styles.optionActive,
        ]}
        onPress={handlePress}
        disabled={isApplying}
        activeOpacity={0.8}
      >
        {/* Active glow ring */}
        {isActive && (
          <Animated.View
            style={[
              styles.glowRing,
              {
                opacity: glow.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.4, 1],
                }),
              },
            ]}
          />
        )}

        {/* Virtual background thumbnail */}
        {isVirtual && filter.imagePath ? (
          <Image
            source={{ uri: filter.imagePath }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        ) : (
          <Text style={styles.optionIcon}>{filter.icon}</Text>
        )}

        {/* Blur intensity bars */}
        {isBlur && (
          <BlurBars type={filter.type} />
        )}

        {/* Label */}
        <Text
          style={[
            styles.optionLabel,
            isActive && styles.optionLabelActive,
            isVirtual && styles.optionLabelVirtual,
          ]}
          numberOfLines={1}
        >
          {filter.label}
        </Text>

        {/* Status indicator */}
        {isActive && isApplying ? (
          <View style={styles.badge}>
            <ActivityIndicator size="small" color="#fff" />
          </View>
        ) : isActive ? (
          <View style={styles.badge}>
            <Text style={styles.badgeIcon}>✓</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
    </View>
  );
}

// ─── Main picker ──────────────────────────────────────────────────────────────

export function BackgroundFilterPicker({
  visible,
  activeFilter,
  isApplying,
  error,
  onSelect,
  onClose,
}: Props) {
  const slideY = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideY, {
        toValue: 0,
        useNativeDriver: true,
        speed: 18,
        bounciness: 4,
      }).start();
    } else {
      slideY.setValue(400);
    }
  }, [visible]);

  const noneFilter   = BACKGROUND_FILTERS.find((f) => f.category === 'none')!;
  const blurFilters  = BACKGROUND_FILTERS.filter((f) => f.category === 'blur');
  const vbgFilters   = BACKGROUND_FILTERS.filter((f) => f.category === 'virtual');

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} />

      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideY }] }]}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Background Effects</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Error banner */}
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {/* None option */}
          <View style={styles.noneRow}>
            <FilterOption
              filter={noneFilter}
              isActive={activeFilter === 'none'}
              isApplying={isApplying && activeFilter === 'none'}
              onPress={() => onSelect('none')}
            />
          </View>

          {/* Blur section */}
          <SectionHeader
            title="🌫️  Background Blur"
            subtitle="AI-powered — keeps you in focus"
          />
          <View style={styles.blurRow}>
            {blurFilters.map((f) => (
              <FilterOption
                key={f.type}
                filter={f}
                isActive={activeFilter === f.type}
                isApplying={isApplying && activeFilter === f.type}
                onPress={() => onSelect(f.type)}
              />
            ))}
          </View>

          {/* Virtual backgrounds section */}
          <SectionHeader
            title="🖼️  Virtual Backgrounds"
            subtitle="Replace your background entirely"
          />
          <View style={styles.vbgGrid}>
            {vbgFilters.map((f) => (
              <FilterOption
                key={f.type}
                filter={f}
                isActive={activeFilter === f.type}
                isApplying={isApplying && activeFilter === f.type}
                onPress={() => onSelect(f.type)}
              />
            ))}
          </View>

          {/* Performance note */}
          <View style={styles.note}>
            <Text style={styles.noteIcon}>⚡</Text>
            <Text style={styles.noteText}>
              Background effects run on-device via ML — may warm up your phone slightly on first use.
            </Text>
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const OPTION_W = 100;
const OPTION_H = 90;
const VBG_W    = 112;
const VBG_H    = 80;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sheet: {
    backgroundColor: '#0e0e1a',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 40,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: 'rgba(79,70,229,0.4)',
    maxHeight: '80%',
    // shadow
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 20,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '700',
  },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    padding: 12,
  },
  errorIcon: { fontSize: 14 },
  errorText: {
    flex: 1,
    color: '#fca5a5',
    fontSize: 12,
    lineHeight: 18,
  },

  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },

  // Section headers
  sectionHeader: {
    marginTop: 20,
    marginBottom: 12,
    gap: 2,
  },
  sectionTitle: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  sectionSubtitle: {
    color: '#4b5563',
    fontSize: 11,
    fontWeight: '500',
  },

  // None row
  noneRow: {
    flexDirection: 'row',
    marginTop: 4,
  },

  // Blur row — 3 options side by side
  blurRow: {
    flexDirection: 'row',
    gap: 10,
  },

  // Virtual background grid — 2 columns, wrap
  vbgGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  // ── Option tile ────────────────────────────────────────────────────────────
  option: {
    width: OPTION_W,
    height: OPTION_H,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    position: 'relative',
    overflow: 'hidden',
  },
  optionVirtual: {
    width: VBG_W,
    height: VBG_H,
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    padding: 0,
  },
  optionActive: {
    borderColor: '#6366f1',
    backgroundColor: 'rgba(99,102,241,0.15)',
  },

  // Virtual BG thumbnail
  thumbnail: {

    borderRadius: 14,
  },

  // Glow ring when active
  glowRing: {
  
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#818cf8',
  },

  optionIcon: {
    fontSize: 26,
  },
  optionLabel: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  optionLabelActive: {
    color: '#a5b4fc',
  },
  optionLabelVirtual: {
    // overlaid on image — needs bg
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    alignSelf: 'stretch',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
  },

  // Badge (checkmark / spinner) — top-right
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeIcon: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },

  // Performance note
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  noteIcon: { fontSize: 13 },
  noteText: {
    flex: 1,
    color: '#374151',
    fontSize: 11,
    lineHeight: 17,
  },
});