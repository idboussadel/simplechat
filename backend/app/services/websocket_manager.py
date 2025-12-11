from fastapi import WebSocket
from typing import Dict, Set, Optional
import json


class ConnectionManager:
    def __init__(self):
        # Store active connections by session_id (for widget connections)
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # Store dashboard connections by chatbot_uuid (for admin monitoring)
        self.dashboard_connections: Dict[str, Set[WebSocket]] = {}
        # Map session_id to chatbot_uuid for dashboard connections
        self.dashboard_session_map: Dict[str, str] = {}
    
    async def connect(self, websocket: WebSocket, session_id: str, chatbot_uuid: Optional[str] = None):
        """Accept WebSocket connection and add to session group"""
        await websocket.accept()
        
        # Track dashboard connections separately
        if chatbot_uuid and session_id.startswith("dashboard_"):
            if chatbot_uuid not in self.dashboard_connections:
                self.dashboard_connections[chatbot_uuid] = set()
            self.dashboard_connections[chatbot_uuid].add(websocket)
            self.dashboard_session_map[session_id] = chatbot_uuid
            print(f"[MANAGER] Dashboard connection registered for chatbot {chatbot_uuid}, session {session_id}")
        else:
            # Regular widget connections
            if session_id not in self.active_connections:
                self.active_connections[session_id] = set()
            self.active_connections[session_id].add(websocket)
    
    def disconnect(self, websocket: WebSocket, session_id: str):
        """Remove WebSocket connection from session group"""
        # Remove from dashboard connections
        if session_id in self.dashboard_session_map:
            chatbot_uuid = self.dashboard_session_map[session_id]
            if chatbot_uuid in self.dashboard_connections:
                self.dashboard_connections[chatbot_uuid].discard(websocket)
                if not self.dashboard_connections[chatbot_uuid]:
                    del self.dashboard_connections[chatbot_uuid]
            del self.dashboard_session_map[session_id]
            print(f"[MANAGER] Dashboard connection removed for chatbot {chatbot_uuid}, session {session_id}")
        else:
            # Remove from regular connections
            if session_id in self.active_connections:
                self.active_connections[session_id].discard(websocket)
                if not self.active_connections[session_id]:
                    del self.active_connections[session_id]
    
    async def send_message(self, message: dict, session_id: str):
        """Send message to all connections in a session"""
        if session_id in self.active_connections:
            # Create list to avoid modification during iteration
            connections = list(self.active_connections[session_id])
            
            for connection in connections:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    print(f"Error sending message: {e}")
                    # Remove dead connections
                    self.disconnect(connection, session_id)
    
    async def broadcast_to_dashboard(self, message: dict, chatbot_uuid: str):
        """Broadcast message to all dashboard connections for a specific chatbot (like WhatsApp)
        Only broadcasts if there are active dashboard connections (optimization)"""
        if chatbot_uuid not in self.dashboard_connections or not self.dashboard_connections[chatbot_uuid]:
            # No dashboard connections, skip broadcast (optimization)
            print("we sent nothing")
            return
        
        connections = list(self.dashboard_connections[chatbot_uuid])
        print(f"[MANAGER] Broadcasting to {len(connections)} dashboard connection(s) for chatbot {chatbot_uuid}")
        
        for connection in connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"[MANAGER] Error broadcasting to dashboard: {e}")
                # Remove dead connections - find session_id for this connection
                for sid, chatbot_uuid_map in self.dashboard_session_map.items():
                    if chatbot_uuid_map == chatbot_uuid:
                        # Find the websocket in the set and remove it
                        if chatbot_uuid in self.dashboard_connections:
                            self.dashboard_connections[chatbot_uuid].discard(connection)
                        break
    
    async def broadcast(self, message: dict):
        """Broadcast message to all active connections"""
        for session_connections in self.active_connections.values():
            for connection in session_connections:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    print(f"Error broadcasting message: {e}")


# Global connection manager instance
manager = ConnectionManager()
