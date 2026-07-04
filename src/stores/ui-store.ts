import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * UI store — client-side UI state (Zustand + localStorage persistence).
 */

interface UIState {
  activeTab: 'home' | 'map' | 'routes' | 'chat' | 'menu'
  setActiveTab: (tab: UIState['activeTab']) => void
  selectedVehicleId: string | null
  setSelectedVehicle: (id: string | null) => void
  selectedRouteId: string | null
  setSelectedRoute: (id: string | null) => void
  mapTheme: string
  setMapTheme: (theme: string) => void
  tripDestination: { lat: number; lon: number; name?: string } | null
  setTripDestination: (dest: { lat: number; lon: number; name?: string } | null) => void
  chatPreFill: string | null
  setChatPreFill: (query: string | null) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      activeTab: 'home',
      setActiveTab: (tab) => set({ activeTab: tab }),
      selectedVehicleId: null,
      setSelectedVehicle: (id) => set({ selectedVehicleId: id }),
      selectedRouteId: null,
      setSelectedRoute: (id) => set({ selectedRouteId: id }),
      mapTheme: 'carto-light',
      setMapTheme: (theme) => set({ mapTheme: theme }),
      tripDestination: null,
      setTripDestination: (dest) => set({ tripDestination: dest }),
      chatPreFill: null,
      setChatPreFill: (query) => set({ chatPreFill: query }),
    }),
    { name: 're-loadsense-ui', partialize: (s) => ({ mapTheme: s.mapTheme }) },
  ),
)
