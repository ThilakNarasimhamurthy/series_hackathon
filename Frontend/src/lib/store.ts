import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CrisisAlert {
    id: string
    severity: string
    user_alias: string
    mood_score?: number
    mood_trend?: number[]
    message_preview: string
    detected_keywords?: string[]
    timestamp: string
}

interface ResponderState {
    isAvailable: boolean
    toggleAvailability: () => void
    notifications: number
    selectedChatId: string | null
    setSelectedChatId: (id: string | null) => void
    alerts: CrisisAlert[]
    addAlert: (alert: CrisisAlert) => void
    removeAlert: (id: string) => void
}

export const useResponderStore = create<ResponderState>()(
    persist(
        (set) => ({
            isAvailable: false,
            toggleAvailability: () => set((state) => ({ isAvailable: !state.isAvailable })),
            notifications: 0,
            selectedChatId: null,
            setSelectedChatId: (id) => set({ selectedChatId: id }),
            alerts: [], // Start with empty array - will be populated from backend
            addAlert: (alert) => set((state) => ({
                alerts: [alert, ...state.alerts],
                notifications: state.notifications + 1
            })),
            removeAlert: (id) => set((state) => ({
                alerts: state.alerts.filter((a) => a.id !== id),
                notifications: Math.max(0, state.notifications - 1)
            })),
        }),
        {
            name: 'responder-storage', // unique name for localStorage
            version: 1, // Add version to track state structure changes
            migrate: (persistedState: any, version: number) => {
                // If version mismatch or invalid state, return default state
                if (version !== 1 || !persistedState || typeof persistedState !== 'object') {
                    return {
                        isAvailable: false,
                        notifications: 0,
                        selectedChatId: null,
                        alerts: [],
                    }
                }
                // Ensure all required fields exist with defaults
                return {
                    isAvailable: persistedState.isAvailable ?? false,
                    notifications: persistedState.notifications ?? 0,
                    selectedChatId: persistedState.selectedChatId ?? null,
                    alerts: Array.isArray(persistedState.alerts) ? persistedState.alerts : [],
                }
            },
        }
    )
)
