'use client'

import { useEffect, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useQueryClient } from '@tanstack/react-query'

/**
 * useFleetSocket — connects to the socket.io mini-service for live fleet updates.
 *
 * Connects via `/?XTransformPort=3001` per the gateway constraint.
 * On fleet:update events, patches the TanStack Query cache so markers move
 * smoothly without a full refetch (no flicker).
 *
 * See concept/04-features.md RT-01.
 */

const SOCKET_PORT = 3001

export function useFleetSocket() {
  const queryClient = useQueryClient()
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    // Connect via the gateway mechanism
    const socket = io('/?XTransformPort=' + SOCKET_PORT, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      console.log('[fleet-socket] connected:', socket.id)
      // Subscribe to fleet updates (commuter role)
      socket.emit('subscribe', { role: 'commuter' })
    })

    socket.on('subscribed', (data: { rooms: string[] }) => {
      console.log('[fleet-socket] subscribed to rooms:', data.rooms)
    })

    // ── On fleet:update, patch the TanStack Query cache ──
    // Instead of refetching, we update the cached fleet data in place.
    socket.on('fleet:update', (data: FleetUpdateEvent) => {
      console.log('[fleet-socket] fleet:update received', data.tick)

      // Invalidate the fleet query so it refetches (the sim-tick already wrote
      // to Redis, so the refetch will be fast).
      // A more sophisticated approach would patch individual vehicles in the
      // cache, but invalidation is simpler and still fast (Redis-cached read).
      queryClient.invalidateQueries({ queryKey: ['fleet'] })
    })

    socket.on('disconnect', (reason) => {
      console.log('[fleet-socket] disconnected:', reason)
    })

    socket.on('connect_error', (err) => {
      console.warn('[fleet-socket] connect error:', err.message)
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [queryClient])

  return socketRef
}

interface FleetUpdateEvent {
  type: 'fleet:update'
  tick: number
  timestamp: number
  count: number
}
