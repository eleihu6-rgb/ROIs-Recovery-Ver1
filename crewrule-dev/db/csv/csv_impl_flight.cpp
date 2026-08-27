#include <sstream>
#include <string.h>
#include "../Segment.h"
#include "UtilFunc.h"
#include "csv_impl.h"


void flightParser::init(vector<string>& headers) {}


void* flightParser::createInstance() {
	return new Segment;
}

void flightParser::deleteInstance(void* obj) {
	delete (Segment*)obj;
}

static vector<string> flightDefaultHeaders = { "id", "schId", "airline", "fltNum", "schDepDtUtc", "schDepDtLoc", "depArp", "schArvDtUtc", "schArvDtLoc", "arvDay", "arvArp", "schBlkMin", "actBlkMin", "segSeq", "segType", "fleet", "subFleet", "tailNumber", "fltType", "flightStatus", "actAln", "actDepDtUtc", "actDepDtLoc", "actArvDtUtc", "actArvDtLoc", "actFltNum", "actDepArp", "actArvArp", "onwardFlt", "acConfig", "ver",
"serviceType", "taxiOut", "taxiIn", "interfaceFltId", "actTakeOffLoc", "actTouchDownUtc", "actTouchDownLoc", "actTakeOffUtc", "actTaxiOutLoc", "actTaxiOutUtc", "actTaxiInUtc", "actTaxiInLoc",
"isLocked", "isExtendedOverWater", "liveId","voyageStatus","flightFlag","flightAssignment","commuteId",
"estDepDtLoc", "estArvDtUtc", "estArvDtLoc", "estDepDtUtc","flightStage","manualOooi",
"blkMin", "onwardFltNum", "register", "acOwner", "pilotOwner", "fltSts", "fltVr", "lastModified", "modifiedBy",
"cabinOwner", "airmarshalOwner", "createdDt","createdBy", "flightSource"};
vector<string>& flightParser::getDefaultHeaders() {
	return flightDefaultHeaders;
}

string flightParser::toCsv(vector<string>& headers, void* obj) {
	
	//id, schId, airline, fltNum, fltDt, schDepDtUtc, schDepDtLoc, depArp, schArvDtUtc, schArvDtLoc, arvArp, schBlkMin, actBlkMin, segSeq, segType, fleet, aircraft, tailNumber, fltType, flightStatus, actAln, actDepDtUtc, actDepDtLoc, actArvDtUtc, actArvDtLoc, actFltNum, actDepArp, actArvArp, onwardFlt, acConfig
	stringstream ss;
	Segment * ref = (Segment *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->getDBId() << "^"; }
		else if (headers[i] == "liveId") { 	ss << ""  << "^";	}
		else if (headers[i] == "schId") { ss << ref->getScenarioId() << "^"; }///
		else if (headers[i] == "fltDt") { ss << ref->getDate() << "^"; }

		else if (headers[i] == "fltNum") { ss << ref->getFlightNumber() << "^"; }
		else if (headers[i] == "depArp") { ss << ref->getDepStation() << "^"; }
		else if (headers[i] == "arvArp") { ss << ref->getArrStation() << "^"; }
		else if (headers[i] == "airline") { ss << ref->getAirline() << "^"; }
		else if (headers[i] == "schBlkMin") { ss << ref->getBlkMinutes() << "^"; }

		else if (headers[i] == "schDepDtUtc") { ss << utcToUtcTzString(ref->getStartTimeUtcSch()) << "^"; }
		else if (headers[i] == "schDepDtLoc") { ss << utcToUtcTzString(ref->getStartTimeLocSch()) << "^"; }
		else if (headers[i] == "schArvDtUtc") { ss << utcToUtcTzString(ref->getEndTimeUtcSch()) << "^"; }
		else if (headers[i] == "schArvDtLoc") { ss << utcToUtcTzString(ref->getEndTimeLocSch()) << "^"; }

		else if (headers[i] == "actFltNum") { ss  << "^"; }
		else if (headers[i] == "actDepArp") { ss << ref->getDepStation() << "^"; }
		else if (headers[i] == "actArvArp") { ss << ref->getArrStation() << "^"; }
		else if (headers[i] == "actAln") { ss << "^"; }
		else if (headers[i] == "actBlkMin") { ss << (ref->getBlkTime()/60) << "^"; }

		else if (headers[i] == "actDepDtUtc") { ss << utcToUtcTzString(ref->getStartTimeUtcSch()) << "^"; }
		else if (headers[i] == "actDepDtLoc") { ss << utcToUtcTzString(ref->getStartTimeLocSch()) << "^"; }
		else if (headers[i] == "actArvDtUtc") { ss << utcToUtcTzString(ref->getEndTimeUtcSch()) << "^"; }
		else if (headers[i] == "actArvDtLoc") { ss << utcToUtcTzString(ref->getEndTimeLocSch()) << "^"; }

		else if (headers[i] == "onwardFlt") { ss << ref->getNextLegNo() << "^"; }
		else if (headers[i] == "acConfig") { ss << "^"; }
		else if (headers[i] == "fleet") { ss << ref->getFleetCD() << "^"; }
		else if (headers[i] == "subFleet") { ss << "^"; }
		else if (headers[i] == "aircraft") { ss << "^"; }
		else if (headers[i] == "arvDay") { ss << "^"; }
		else if (headers[i] == "vrAdd") { ss <<(ref->getIsVrAdd()?"1":"0") << "^"; }
		else if (headers[i] == "tailNumber") { ss << ref->getTailNum() << "^"; }
		else if (headers[i] == "fltType") { ss << ref->getFltType()<<"^"; }
		else if (headers[i] == "flightStatus") { ss << ref->getFltSts() << "^"; }
		else if (headers[i] == "segSeq") { ss << "^"; }
		else if (headers[i] == "segType") { ss << ref->getDomIntType() << "^"; }
		else if (headers[i] == "ver") { ss << "^"; }
		else if (headers[i] == "serviceType") { ss << "^"; }
		else if (headers[i] == "taxiOut") { ss  << "^"; }
		else if (headers[i] == "taxiIn") { ss << "^"; }
		else if (headers[i] == "createdBy") { ss << "^"; }
		else if (headers[i] == "createdDt") { ss << "^"; }

		else if (headers[i] == "interfaceFltId") { ss << "^"; }
		else if (headers[i] == "actTakeOffLoc") { ss << "^"; }
		else if (headers[i] == "actTouchDownUtc") { ss << "^"; }
		else if (headers[i] == "actTouchDownLoc") { ss << "^"; }
		else if (headers[i] == "actTakeOffUtc") { ss << "^"; }
		else if (headers[i] == "actTaxiOutLoc") { ss <<  "^"; }
		else if (headers[i] == "actTaxiOutUtc") { ss << "^"; }
		else if (headers[i] == "actTaxiInUtc") { ss << "^"; }
		else if (headers[i] == "actTaxiInLoc") { ss << "^"; }

		else if (headers[i] == "isLocked") { ss << "^"; }
		else if (headers[i] == "isExtendedOverWater") { ss << "^"; }
		else if (headers[i] == "voyageStatus") { ss << "^"; }
		else if (headers[i] == "flightFlag") { ss << ref->getFlightFlag() << "^"; }
		else if (headers[i] == "flightAssignment") { ss << ref->getAssignment() << "^"; }
		else if (headers[i] == "commuteId") { ss << "^"; }

		else if (headers[i] == "estDepDtLoc") { ss << utcToUtcTzString(ref->getEstDepDtLoc()) << "^"; }
		else if (headers[i] == "estArvDtUtc") { ss << utcToUtcTzString(ref->getEstArvDtUtc()) << "^"; }
		else if (headers[i] == "estArvDtLoc") { ss << utcToUtcTzString(ref->getEstArvDtLoc()) << "^"; }
		else if (headers[i] == "estDepDtUtc") { ss << utcToUtcTzString(ref->getEstDepDtUtc()) << "^"; }
		else if (headers[i] == "etdChgTm") { ss << utcToUtcTzString(ref->getEtdChgTm()) << "^"; }
        else if (headers[i] == "fltDelayNotifyUtc") { ss << utcToUtcTzString(ref->getFltDelayNotifyUtc()) << "^"; }
        else if (headers[i] == "fltLastDelayEtdUtc") { ss << utcToUtcTzString(ref->getFltLastDelayEtdUtc()) << "^"; }
		else if (headers[i] == "flightStage") { ss << "^"; }
		else if (headers[i] == "manualOooi") { ss << "^"; }
		else if (headers[i] == "blkMin") { ss << "^"; }
		else if (headers[i] == "onwardFltNum") { ss << "^"; }
		else if (headers[i] == "register") { ss << "^"; }
		else if (headers[i] == "acOwner") { ss << "^"; }
		else if (headers[i] == "pilotOwner") { ss << ref->getPilotOwner() << "^"; }
		else if (headers[i] == "fltSts") { ss << ref->getFltSts() << "^"; }
		else if (headers[i] == "fltVr") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "cabinOwner") { ss << ref->getCabinOwner() << "^"; }
		else if (headers[i] == "airmarshalOwner") { ss << ref->getAirmarshalOwner() << "^"; }
		else if (headers[i] == "apisStage") { ss << "^"; }
		else if (headers[i] == "deviceCode") { ss << ref->getDeviceCode() << "^"; }
		else if (headers[i] == "flightSource") { ss << ref->getFlightSource() << "^"; }
		else { logUnkonwnField("flight", headers[i]); }
	}
	return ss.str();
}

long long split_cost = 0;///TEST

void flightParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	Segment * ref = (Segment *)obj;
	int i = index;
	if (headers[i] == "id") { ref->setDBId(atoll(value)); }
	else if (headers[i] == "liveId") {  }
	else if (headers[i] == "schId") { ref->setScenarioId(atoll(value)); }///
	else if (headers[i] == "fltDt") { ref->setDate(value); }
	else if (headers[i] == "vrAdd") { ref->setIsVrAdd(0 == strncmp("1", value, 1)); }
	else if (headers[i] == "fltNum") { ref->setFlightNumber(value); }
	else if (headers[i] == "depArp") { if (ref->getDepStation() == "") ref->setDepStation(value); }
	else if (headers[i] == "arvArp") { if (ref->getArrStation() == "") ref->setArrStation(value); }
	else if (headers[i] == "airline") { ref->setAirline(value); }//mantis#8851, ����savePO���segment.airlineΪ��
	else if (headers[i] == "schBlkMin") { ref->setBlkSeconds(atoi(value) * 60); }
	else if (headers[i] == "blkMin") { ref->setBlkSeconds(atoi(value) * 60); }

	else if (headers[i] == "schDepDtUtc") { ref->setStartTimeUtcSch(utcStrToUtc(value)); }
	else if (headers[i] == "schDepDtLoc") { ref->setStartTimeLocSch(utcStrToUtc(value)); }
	else if (headers[i] == "schArvDtUtc") { ref->setEndTimeUtcSch(utcStrToUtc(value)); }
	else if (headers[i] == "schArvDtLoc") { ref->setEndTimeLocSch(utcStrToUtc(value)); }

	else if (headers[i] == "actFltNum") {}
	else if (headers[i] == "actDepArp") { if (value != "") ref->setDepStation(value); }
	else if (headers[i] == "actArvArp") { if (value != "") ref->setArrStation(value); }
	else if (headers[i] == "actAln") {}
	else if (headers[i] == "actBlkMin") {}

	else if (headers[i] == "actDepDtUtc") { ref->setStartTimeUtcAct(utcStrToUtc(value)); }
	else if (headers[i] == "actDepDtLoc") { ref->setStartTimeLocAct(utcStrToUtc(value)); }
	else if (headers[i] == "actArvDtUtc") { ref->setEndTimeUtcAct(utcStrToUtc(value)); }
	else if (headers[i] == "actArvDtLoc") { ref->setEndTimeLocAct(utcStrToUtc(value)); }

	else if (headers[i] == "onwardFlt") { ref->setNextLegNo(value); }
	else if (headers[i] == "acConfig") {}
	else if (headers[i] == "fleet") { ref->setFleetCD(value); }
	else if (headers[i] == "subFleet") { ref->setSubFleet(value); }
	else if (headers[i] == "aircraft") { ref->setAircraft(value); }
	else if (headers[i] == "arvDay") {}

	else if (headers[i] == "tailNumber") { ref->setTailNum(value); }
	else if (headers[i] == "fltType") { ref->setFltType(value); }
	else if (headers[i] == "flightStatus") { ref->setFltSts(value); }
	else if (headers[i] == "segSeq") { }
	else if (headers[i] == "segType") { ref->setDomIntType(value); }
	else if (headers[i] == "ver") {}

	else if (headers[i] == "serviceType") { ref->setServiceType(value); }
	else if (headers[i] == "taxiOut") { }
	else if (headers[i] == "taxiIn") { }
	else if (headers[i] == "createdBy") { }
	else if (headers[i] == "createdDt") { }

	else if (headers[i] == "interfaceFltId") {}
	else if (headers[i] == "actTakeOffLoc") { ref->setActTakeOffLoc(utcStrToUtc(value)); }
	else if (headers[i] == "actTouchDownUtc") { ref->setActTouchDownUtc(utcStrToUtc(value)); }
	else if (headers[i] == "actTouchDownLoc") { ref->setActTouchDownLoc(utcStrToUtc(value)); }
	else if (headers[i] == "actTakeOffUtc") { ref->setActTakeOffUtc(utcStrToUtc(value)); }
	else if (headers[index] == "actTaxiOutLoc") { ref->setActTaxiOutLoc(utcStrToUtc(value)); }
	else if (headers[index] == "actTaxiOutUtc") { ref->setActTaxiOutUtc(utcStrToUtc(value)); }
	else if (headers[index] == "actTaxiInUtc") { ref->setActTaxiInUtc(utcStrToUtc(value)); }
	else if (headers[index] == "actTaxiInLoc") { ref->setActTaxiInLoc(utcStrToUtc(value)); }

	else if (headers[i] == "isLocked") { }
	else if (headers[i] == "isExtendedOverWater") { }
	else if (headers[i] == "voyageStatus") {}
	else if (headers[i] == "flightFlag") { ref->setFlightFlag(value); }
	else if (headers[i] == "flightAssignment") { ref->setAssignment(value); }
	else if (headers[i] == "commuteId") {}

	else if (headers[i] == "estDepDtLoc") { ref->setEstDepDtLoc(utcStrToUtc(value)); }
	else if (headers[i] == "estArvDtUtc") { ref->setEstArvDtUtc(utcStrToUtc(value)); }
	else if (headers[i] == "estArvDtLoc") { ref->setEstArvDtLoc(utcStrToUtc(value)); }
	else if (headers[i] == "estDepDtUtc") { ref->setEstDepDtUtc(utcStrToUtc(value)); }
	else if (headers[i] == "etdChgTm") { ref->setEtdChgTm(utcStrToUtc(value) == -1 ? 0 : utcStrToUtc(value)); }
	else if (headers[i] == "fltDelayNotifyUtc") { ref->setFltDelayNotifyUtc(utcStrToUtc(value) == -1 ? 0 : utcStrToUtc(value)); }
	else if (headers[i] == "fltLastDelayEtdUtc") { ref->setFltLastDelayEtdUtc(utcStrToUtc(value) == -1 ? 0 : utcStrToUtc(value)); }
	else if (headers[i] == "flightStage") {}
	else if (headers[i] == "manualOooi") {}
	else if (headers[i] == "blkMin") { ref->setBlkMinHistory(stoi(value)); }
	else if (headers[i] == "onwardFltNum") { ref->setNextLegNo(value); }
	else if (headers[i] == "register") { ref->setTailNum(value); ref->setRegister(value); }
	else if (headers[i] == "acOwner") { }
	else if (headers[i] == "pilotOwner") { ref->setPilotOwner(value); }
	else if (headers[i] == "fltSts") { ref->setFltSts(value); }
	else if (headers[i] == "fltVr") { }
	else if (headers[i] == "lastModified") { }
	else if (headers[i] == "modifiedBy") { }
	else if (headers[i] == "cabinOwner") { ref->setCabinOwner(value); }
	else if (headers[i] == "airmarshalOwner") { ref->setAirmarshalOwner(value); }
	else if (headers[i] == "apisStage") {}
	else if (headers[i] == "price") {}
	else if (headers[i] == "deviceCode") { ref->setDeviceCode(value);}
	else if (headers[i] == "flightKey") {}
	else if (headers[i] == "fltDtUtc") {}
	else if (headers[i] == "suffix") {}
	else if (headers[i] == "payFlyHours") {}
	else if (headers[i] == "actDoorClosedUtc") {}
	else if (headers[i] == "actDoorOpenUtc") {}
	else if (headers[i] == "originFltDtUtc") {}
	else if (headers[i] == "originInterfaceFltId") {}
	else if (headers[i] == "remark") {}
	else if (headers[i] == "legNo") {}
	else if (headers[i] == "flightSource") {ref->setFlightSource(value); }
	else { logUnkonwnField("flight", headers[index]); }

}