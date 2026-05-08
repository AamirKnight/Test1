// src/components/BackgroundFilterPicker.tsx
// Bottom sheet to pick background blur/filter options

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
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
  onSelect: (filter: BackgroundFilterType) => void;
  onClose: () => void;
}

export function BackgroundFilterPicker({
  visible,
  activeFilter,
  isApplying,
  onSelect,
  onClose,
}: Props) {
  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Background Filter</Text>
        <Text style={styles.subtitle}>
          Requires @livekit/track-processors package
        </Text>

        <View style={styles.grid}>
          {BACKGROUND_FILTERS.map((filter) => (
            <TouchableOpacity
              key={filter.type}
              style={[
                styles.option,
                activeFilter === filter.type && styles.optionActive,
              ]}
              onPress={() => onSelect(filter.type)}
              disabled={isApplying}
              activeOpacity={0.7}
            >
              {isApplying && activeFilter !== filter.type ? null : (
                <>
                  <Text style={styles.optionIcon}>{filter.icon}</Text>
                  <Text
                    style={[
                      styles.optionLabel,
                      activeFilter === filter.type && styles.optionLabelActive,
                    ]}
                  >
                    {filter.label}
                  </Text>
                  {activeFilter === filter.type && isApplying && (
                    <ActivityIndicator
                      size="small"
                      color="#4f46e5"
                      style={styles.loader}
                    />
                  )}
                  {activeFilter === filter.type && !isApplying && (
                    <View style={styles.checkmark}>
                      <Text style={styles.checkmarkIcon}>✓</Text>
                    </View>
                  )}
                </>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#12121f',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: 'rgba(79,70,229,0.3)',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    color: '#6b7280',
    fontSize: 12,
    marginBottom: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  option: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 16,
    alignItems: 'center',
    gap: 8,
    position: 'relative',
  },
  optionActive: {
    backgroundColor: 'rgba(79,70,229,0.2)',
    borderColor: '#4f46e5',
  },
  optionIcon: {
    fontSize: 28,
  },
  optionLabel: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '600',
  },
  optionLabelActive: {
    color: '#a5b4fc',
  },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmarkIcon: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  loader: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
});