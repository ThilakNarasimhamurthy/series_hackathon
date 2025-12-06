import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { MOCK_CRISIS_ALERTS } from './mockData'

export interface CrisisAlert {
    id: string
    severity: string
    user_alias: string
    mood_score: number
    mood_trend: number[]
    message_preview: string
    detected_keywords: string[]
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
            notifications: 2,
            selectedChatId: null,
            setSelectedChatId: (id) => set({ selectedChatId: id }),
            alerts: MOCK_CRISIS_ALERTS, // Initial state from mock data
            addAlert: (alert) => set((state) => ({
                alerts: [alert, ...state.alerts],
                notifications: state.notifications + 1
            })),
            removeAlert: (id) => set((state) => ({
                alerts: state.alerts.filter((a) => a.id !== id)
            })),
        }),
        {
            name: 'responder-storage', // unique name for localStorage
        }
    )
)
