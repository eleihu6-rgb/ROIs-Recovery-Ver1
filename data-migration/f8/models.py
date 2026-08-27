from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel


# --- Auth ---

class TokenResponse(BaseModel):
    accessToken: str
    accessTokenExpirationTime: str  # ISO 8601 UTC string


# --- Crew ---

class CrewBase(BaseModel):
    crewId: int
    base: str
    effDt: datetime
    expDt: datetime
    isPrimary: bool


class CrewRank(BaseModel):
    rank: str
    effDt: datetime
    expDt: datetime


class CrewCertificate(BaseModel):
    certificate: str
    isValid: bool
    expDt: datetime


class CrewTeam(BaseModel):
    crewId: int | str
    teamId: str
    teamName: str = ""
    effDt: datetime
    expDt: datetime
    isValid: bool = True


class CrewRecord(BaseModel):
    owner: str
    crewId: int
    firstName: str
    middleName: str = ""
    lastName: str
    gender: str = ""
    telephone: str = ""
    workEmail: str = ""
    bases: list[CrewBase] = []
    ranks: list[CrewRank] = []
    fleets: list[dict[str, Any]] = []          # confirm schema against MySQL table
    certificates: list[CrewCertificate] = []
    qualifications: list[dict[str, Any]] = []  # confirm schema against MySQL table
    teams: list[CrewTeam] = []


# --- Flight ---

class FlightRecord(BaseModel):
    owner: str = ""
    legNo: int
    datOp: datetime
    fltId: str
    depStn: str
    arrStn: str
    status: str = ""
    std: datetime
    sta: datetime
    atd: Optional[datetime] = None
    ata: Optional[datetime] = None
    acGrp: str = ""
    acReg: str = ""


# --- Pairing ---

class PairingComposition(BaseModel):
    actingRank: str
    planValue: int


class DutyNode(BaseModel):
    node: str          # CheckIn | CheckOut
    startUtc: Optional[datetime] = None
    endUtc: Optional[datetime] = None
    airport: str = ""


class DutySegment(BaseModel):
    segSeq: int
    dutySeq: int
    fltId: int = 0     # 0 = SBY/DHD, >0 = FLY
    fltNum: str = ""
    fltDt: Optional[datetime] = None
    depArp: str = ""
    arvArp: str = ""
    assignment: str = ""
    airline: str = ""
    fleet: str = ""
    actStrDtUtc: Optional[datetime] = None
    actEndDtUtc: Optional[datetime] = None


class PairingDuty(BaseModel):
    dutyId: int
    dutySeq: int
    strArp: str = ""
    arrArp: str = ""
    actStrDtUtc: Optional[datetime] = None
    actEndDtUtc: Optional[datetime] = None
    creditMin: int = 0
    assignment: str = ""
    nodes: list[DutyNode] = []
    segments: list[DutySegment] = []


class PairingRecord(BaseModel):
    pairingId: str
    pairingDt: str
    label: str = ""
    base: str = ""
    fleet: str = ""
    durationDays: int = 0
    pairingCompositions: list[PairingComposition] = []
    pairingDutyList: list[PairingDuty] = []


# --- RosterFlight ---

class RosterCrewInfo(BaseModel):
    crewId: str
    crewName: str = ""
    actingRank: str = ""


class RosterFlightRecord(BaseModel):
    rosterFlightId: int
    pairingId: int
    fltId: str = ""
    depArp: str = ""
    arrArp: str = ""
    dutyStrUtc: Optional[datetime] = None
    crew: RosterCrewInfo
