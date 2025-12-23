from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from sqlalchemy import event
from datetime import datetime
from fastapi.staticfiles import StaticFiles 
from fastapi.responses import FileResponse  
from typing import List, Optional

#Database Setup
SQLALCHEMY_DATABASE_URL = "sqlite:///./forestmind.sqlite"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    # Logic: 20s timeout prevents 'Database is locked' crashes
    connect_args={"check_same_thread": False, "timeout": 20} 
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    # Logic: This allows Python and Node to read/write simultaneously
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()

class ChatSessionDB(Base):
    __tablename__ = "sessions"
    id = Column(String, primary_key=True, index=True)
    title = Column(String, default="New Chat")
    created_at = Column(DateTime, default=datetime.now)
    chat_preview = Column(String, default="No Chat Preview")

    messages = relationship("MessageDB", back_populates="session", cascade="all, delete-orphan")

class MessageDB(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("sessions.id"))
    sender = Column(String) # 'user' or 'ai'
    content = Column(Text)
    timestamp = Column(DateTime, default=datetime.utcnow)

    session = relationship("ChatSessionDB", back_populates="messages")

class SessionResponse(BaseModel):
    id: str
    title: str
    chat_preview: str
    created_at: datetime
    
    # Crucial: This tells Pydantic to read from the DB object
    class Config:
        from_attributes = True

Base.metadata.create_all(bind=engine)

# 3. FASTAPI SETUP
app = FastAPI()

# Enable CORS (So your HTML file can talk to this Python server)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, change this to your specific URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class MessageCreate(BaseModel):
    content:str
    sender:str

class SessionCreate(BaseModel):
    id: str

class SessionUpdate(BaseModel):
    title: Optional[str] = None
    chat_preview: Optional[str] = None

@app.patch("/sessions/{session_id}")
def update_session(session_id:str, update_data:SessionUpdate, db:Session = Depends(get_db)):
    db_session = db.query(ChatSessionDB).filter(ChatSessionDB.id == session_id).first()
    if update_data.title is not None:
        db_session.title = update_data.title # type: ignore
    
    if update_data.chat_preview is not None:
        db_session.chat_preview = update_data.chat_preview # type: ignore
    # 3. Save changes
    db.commit()
    db.refresh(db_session)
    
    return {"status": "updated", "session": db_session}



@app.post("/sessions/")
def create_session(session:SessionCreate, db:Session = Depends(get_db)):
    db_session = ChatSessionDB(id=session.id)
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session

@app.get("/sessions/", response_model=List[SessionResponse])
def get_sessions(db: Session = Depends(get_db)):
    return db.query(ChatSessionDB).order_by(ChatSessionDB.created_at.desc()).all()

@app.post("/sessions/{session_id}/messages/")
def create_message(session_id:str, messages:MessageCreate, db:Session = Depends(get_db)):
    db_session = db.query(ChatSessionDB).filter(ChatSessionDB.id == session_id).first()
    handleEmptyResponse(db_session)
    db_message = MessageDB(
        session_id = session_id,
        content = messages.content,
        sender = messages.sender
    )
    db.add(db_message)
    db.commit()
    db.refresh(db_message)
    return db_message


@app.get("/sessions/{session_id}/messages/")
def get_messages(session_id:str, limit:int = Query(0, ge=0), db:Session = Depends(get_db)):
    query = db.query(MessageDB).filter(MessageDB.session_id == session_id)
    print(f'query: {query}')
    if limit:
        messages = query.order_by(MessageDB.timestamp.desc()).limit(limit).all()
        return messages[::-1]
    else:
        return query.order_by(MessageDB.timestamp.asc()).all()
    

@app.delete("/sessions/{session_id}")
def delete_session(session_id:str, db:Session = Depends(get_db)):
    db_session = db.query(ChatSessionDB).filter(ChatSessionDB.id == session_id).first()
    handleEmptyResponse(db_session)
    db.delete(db_session)
    db.commit()
    return {"message":"Session Deleted Successfully!"}

@app.delete("sessions/{session_id}/messages/{message_id}")
def delete_message(session_id:str, message_id:str, db:Session = Depends(get_db)):
    db_message = db.query(MessageDB).filter(MessageDB.id == message_id and MessageDB.session_id == session_id).first()
    handleEmptyResponse(db_message)
    db.delete(db_message)
    db.commit()
    return {"message":"Message Deleted Successfully!"}


def handleEmptyResponse(dbResponse):
    if not dbResponse:
        raise HTTPException(status_code=404, detail="Session not Found!")

#ALWAYS ON THE BOTTOM:
app.mount("/static", StaticFiles(directory="."), name="static")

@app.get("/")
async def read_root():
    # When user visits http://localhost:8000/, send them the HTML file
    return FileResponse('index.html')
