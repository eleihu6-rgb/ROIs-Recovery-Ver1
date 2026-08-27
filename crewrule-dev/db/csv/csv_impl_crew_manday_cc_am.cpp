#include <sstream>
#include <memory.h>
#include "../CrewDB.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "csv_impl.h"

static map<string, bool> g_csv_manday_cc_invalid_header;
static void printfErrorMsgMandayCcHeader(csvParser* csvParser, string header) {
	if (g_csv_manday_cc_invalid_header.find(header) == g_csv_manday_cc_invalid_header.end()) {
		csvParser->logUnkonwnField("crew_manday_cc_am", header);
		g_csv_manday_cc_invalid_header[header] = true;
	}
}


void mandayCcAmParser::init(vector<string>& headers) {
	headerSetters["id"] = [](char* v, void* obj) {};
	headerSetters["scenarioId"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->idScenario = atoll(value); };
	headerSetters["crewId"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->idCrew = value; };
	headerSetters["crewBaseDt"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->dateLoc = utcStrToUtc(value); };
	headerSetters["blh"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->blh = atoi(value); };
	headerSetters["ft"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->ft = atoi(value); };
	headerSetters["fdp"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->fdp = atoi(value); };
	headerSetters["dp"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->dp = atoi(value); };
	headerSetters["nightDp"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->NIGHT_DP = atoi(value); };
	headerSetters["ground"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->GND = atoi(value); };
	headerSetters["standby"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->STANDBY = atoi(value); };
	headerSetters["travel"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->TRAVEL = atoi(value); };

	headerSetters["credit"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->credit = atof(value); };
	headerSetters["pncCredit"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM*)obj)->credit_pnc = atof(value); };
	headerSetters["simCredit"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM*)obj)->credit_sim = atof(value); };
	headerSetters["alCredit"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM*)obj)->credit_al = atof(value); };
	headerSetters["olCredit"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM*)obj)->credit_ol = atof(value); };
	headerSetters["freighterCredit"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM*)obj)->credit_freighter = atof(value); };
	headerSetters["schCredit"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM*)obj)->sch_credit = atof(value); };
	headerSetters["schPncCredit"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM*)obj)->sch_credit_pnc = atof(value); };
	headerSetters["schSimCredit"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM*)obj)->sch_credit_sim = atof(value); };
	headerSetters["schAlCredit"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM*)obj)->sch_credit_al = atof(value); };
	headerSetters["schOlCredit"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM*)obj)->sch_credit_ol = atof(value); };
	headerSetters["schFreighterCredit"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM*)obj)->sch_credit_freighter = atof(value); };

	headerSetters["fatigue"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->FATIGUE = atoi(value); };
	
	headerSetters["pubFt"] = [](char* value, void* obj) {  };
	headerSetters["pubGround"] = [](char* value, void* obj) {  };

	headerSetters["isLeave"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->LEAVE = (0 == memcmp(value, "1", 1) ? 1 : 0); };
	headerSetters["isDayOff"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->DAY_OFF = ((0 == memcmp(value, "1", 1) ? 1 : 0)); };
	headerSetters["custDp"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->cust_dp = atoi(value); };

	headerSetters["perDiem"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->PER_DIEM = atof(value); };
	headerSetters["lhPerDiem"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM*)obj)->LONG_PER_DIEM = atof(value); };
	headerSetters["schPerDiem"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM*)obj)->SCH_PER_DIEM = atof(value); };
	headerSetters["schLhPerDiem"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM*)obj)->SCH_LONG_PER_DIEM = atof(value); };
	headerSetters["workingHour"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM*)obj)->workingHour = atof(value); };
	headerSetters["schWorkingHour"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM*)obj)->schWorkingHour = atof(value); };
	
	headerSetters["normalWp"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->normal_wp = atoi(value); };
	headerSetters["extendWp"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->extend_wp = atoi(value); };
	headerSetters["csb"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->CSB = atoi(value); };
	headerSetters["hsb"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->HSB = atoi(value); };
	headerSetters["asb"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->ASB = atoi(value); };

	headerSetters["lastModified"] = [](char* value, void* obj) { };
	headerSetters["modifiedBy"] = [](char* value, void* obj) {  };

	headerSetters["isAl"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->IS_AL = atoi(value); };
	headerSetters["quarantine"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->QUARANTINE = atoi(value); };
	headerSetters["custData1"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->custData1 = atof(value); };
	headerSetters["custData2"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->custData2 = atof(value); };
	headerSetters["highPlateau"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->HIGH_PLATEAU = atoi(value); };

	headerSetters["operatingFleets"] = [](char* value, void* obj) {
		((CREW_MANDAY_CC_AM *)obj)->operating_fleets.clear();
		split(value, '|', ((CREW_MANDAY_CC_AM *)obj)->operating_fleets);
	};

	headerSetters["operatingAirports"] = [](char* value, void* obj) {  
		((CREW_MANDAY_CC_AM *)obj)->operating_airports.clear();
		split(value, '|', ((CREW_MANDAY_CC_AM *)obj)->operating_airports);
	};

	headerSetters["sbyDp"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM*)obj)->SBY_DP = atof(value); };
	headerSetters["dhdDp"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM*)obj)->DHD_DP = atof(value); };
	headerSetters["attributes"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM*)obj)->attributes = value; };
	headerSetters["intBlh"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM*)obj)->intBlh = atoi(value); };
	headerSetters["fltNum"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM*)obj)->fltNum = atoi(value); };

	headerSetters["layoverTimes"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM*)obj)->layoverTimes = atoi(value); };
	headerSetters["layoverDuration"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM*)obj)->layoverDuration = atoi(value); };
	headerSetters["crossTzDutyCount"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM*)obj)->crossTzDutyCount = atoi(value); };
	headerSetters["isDomesticDo"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->isDomesticDo = atoi(value); };
	headerSetters["isFirstRecySixOffsetDdo"] = [](char* value, void* obj) {  ((CREW_MANDAY_CC_AM *)obj)->isFirstRecy6Offsetddo = (0 == memcmp(value, "1", 1) ? true : false); };

}

string mandayCcAmParser::toCsv(vector<string>& headers, void* obj) {
	//"id", "crewId", "", "effDt", "expDt
	stringstream ss;
	CREW_MANDAY_CC_AM * ref = (CREW_MANDAY_CC_AM *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "scenarioId") { ss << ref->idScenario << "^"; }
		else if (headers[i] == "crewId") { ss << ref->idCrew << "^"; }
		else if (headers[i] == "crewBaseDt") { ss << (ref->dateLoc != 0 ? utcToUtcDtString(ref->dateLoc) : utcToUtcDtString(ref->dateLoc)) << "^"; }
		else if (headers[i] == "blh") { ss << (int)round(ref->blh) << "^"; }
		else if (headers[i] == "ft") { ss << (int)round(ref->ft) << "^"; }
		else if (headers[i] == "fdp") { ss << (int)round(ref->fdp) << "^"; }
		else if (headers[i] == "dp") { ss << (int)round(ref->dp) << "^"; }
		else if (headers[i] == "nightDp") { ss << (int)round(ref->NIGHT_DP) << "^"; }
		else if (headers[i] == "ground") { ss << ref->GND << "^"; }
		else if (headers[i] == "standby") { ss << ref->STANDBY << "^"; }
		else if (headers[i] == "travel") { ss << ref->TRAVEL << "^"; }
		else if (headers[i] == "credit") { ss << Utility::round(ref->credit, 2) << "^"; }
		else if (headers[i] == "pncCredit") { ss << Utility::round(ref->credit_pnc, 2) << "^"; }
		else if (headers[i] == "simCredit") { ss << Utility::round(ref->credit_sim, 2) << "^"; }
		else if (headers[i] == "alCredit") { ss << Utility::round(ref->credit_al, 2) << "^"; }
		else if (headers[i] == "olCredit") { ss << Utility::round(ref->credit_ol, 2) << "^"; }
		else if (headers[i] == "freighterCredit") { ss << Utility::round(ref->credit_freighter, 2) << "^"; }

		else if (headers[i] == "schCredit") { ss << Utility::round(ref->sch_credit, 2) << "^"; }
		else if (headers[i] == "schPncCredit") { ss << Utility::round(ref->sch_credit_pnc, 2) << "^"; }
		else if (headers[i] == "schSimCredit") { ss << Utility::round(ref->sch_credit_sim, 2) << "^"; }
		else if (headers[i] == "schAlCredit") { ss << Utility::round(ref->sch_credit_al, 2) << "^"; }
		else if (headers[i] == "schOlCredit") { ss << Utility::round(ref->sch_credit_ol, 2) << "^"; }
		else if (headers[i] == "schFreighterCredit") { ss << Utility::round(ref->sch_credit_freighter, 2) << "^"; }

		else if (headers[i] == "fatigue") { ss << ref->FATIGUE << "^"; }
		else if (headers[i] == "pubFt") { ss << "^"; }
		//else if (headers[i] == "pubBlh") { ss << ref->PUB_BLH << "^"; }
		//else if (headers[i] == "pubFdp") { ss << ref->PUB_FDP << "^"; }
		//else if (headers[i] == "pubDp") { ss << ref->PUB_DP << "^"; }
		//else if (headers[i] == "pubNightDp") { ss << ref->PUB_NIGHT_DP << "^"; }
		//else if (headers[i] == "pubTravel") { ss << ref->PUB_TRAVEL << "^"; }
		//else if (headers[i] == "pubCredit") { ss << ref->PUB_CREDIT << "^"; }
		//else if (headers[i] == "pubFatigue") { ss << ref->PUB_FATIGUE << "^"; }
		//else if (headers[i] == "pubLeave") { ss << ref->PUB_LEAVE << "^"; }
		//else if (headers[i] == "pubDayOff") { ss << ref->PUB_DAY_OFF << "^"; }
		//else if (headers[i] == "pubStandby") { ss << ref->PUB_STANDBY << "^"; }
		else if (headers[i] == "pubGround") { ss << "^"; }
		else if (headers[i] == "isLeave") { ss << (ref->LEAVE ? "1" : "0") << "^"; }
		else if (headers[i] == "isDayOff") { ss << (ref->DAY_OFF == DAY_OFF_EXIST ? "1" : "0") << "^"; }
		else if (headers[i] == "custDp") { ss << ref->cust_dp << "^"; }
		else if (headers[i] == "perDiem") { ss << Utility::round(ref->PER_DIEM, 2) << "^"; }
		else if (headers[i] == "lhPerDiem") { ss << Utility::round(ref->LONG_PER_DIEM, 2) << "^"; }
		else if (headers[i] == "schPerDiem") { ss << Utility::round(ref->SCH_PER_DIEM, 2) << "^"; }
		else if (headers[i] == "schLhPerDiem") { ss << Utility::round(ref->SCH_LONG_PER_DIEM, 2) << "^"; }
		else if (headers[i] == "workingHour") { ss << Utility::round(ref->workingHour, 2) << "^"; }
		else if (headers[i] == "schWorkingHour") { ss << Utility::round(ref->schWorkingHour, 2) << "^"; }
		else if (headers[i] == "normalWp") { ss << ref->normal_wp << "^"; }
		else if (headers[i] == "extendWp") { ss << ref->extend_wp << "^"; }
		else if (headers[i] == "csb") { ss << ref->CSB << "^"; }
		else if (headers[i] == "hsb") { ss << ref->HSB << "^"; }
		else if (headers[i] == "asb") { ss << ref->ASB << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "isAl") { ss << ref->IS_AL << "^"; }
		else if (headers[i] == "quarantine") { ss << ref->QUARANTINE << "^"; }
		else if (headers[i] == "custData1") { ss << ref->custData1 << "^"; }
		else if (headers[i] == "custData2") { ss << ref->custData2 << "^"; }
		else if (headers[i] == "highPlateau") { ss << ref->HIGH_PLATEAU << "^"; }
		else if (headers[i] == "operatingFleets") { ss << joinStrList(ref->operating_fleets, "|") << "^"; }
		else if (headers[i] == "operatingAirports") { ss << joinStrList(ref->operating_airports, "|") << "^"; }
		else if (headers[i] == "isPosition") { ss << ref->IS_POSITION << "^"; }
		else if (headers[i] == "sbyDp") { ss << (int)round(ref->SBY_DP) << "^"; }
		else if (headers[i] == "dhdDp") { ss << (int)round(ref->DHD_DP) << "^"; }
		else if (headers[i] == "layoverDay") { ss << ref->layover_day << "^"; }
		else if (headers[i] == "attributes") { ss << ref->attributes << "^"; }
		else if (headers[i] == "intBlh") { ss << ref->intBlh << "^"; }
		else if (headers[i] == "fltNum") { ss << ref->fltNum << "^"; }
		else if (headers[i] == "layoverTimes") { ss << ref->layoverTimes << "^"; }
		else if (headers[i] == "layoverDuration") { ss << ref->layoverDuration << "^"; }
		else if (headers[i] == "crossTzDutyCount") { ss << ref->crossTzDutyCount << "^"; }
		else if (headers[i] == "isDomesticDo") { ss << (ref->isDomesticDo == DAY_OFF_EXIST ? DAY_OFF_EXIST : DAY_OFF_NOT_EXIST) << "^"; }
		else if (headers[i] == "isFirstRecySixOffsetDdo") { ss << (ref->isFirstRecy6Offsetddo ? "1" : "0") << "^"; }
		else { printfErrorMsgMandayCcHeader(this, headers[i]); }
	}
	return ss.str();
}

void mandayCcAmParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	long long t0 = getTimestampNano();

	CREW_MANDAY_CC_AM * ref = (CREW_MANDAY_CC_AM *)obj;

	if (headerSetters.find(headers[index]) != headerSetters.end()) {
		headerSetters[headers[index]](value, obj);
	} 
	else {
		printfErrorMsgMandayCcHeader(this, headers[index]);
	}

	dbgTestTimer += getTimestampNano() - t0;
	//if (headers[index] == "id") {}
	//else if (headers[index] == "scenarioId") { ref->idScenario = atoll(value); }
	//else if (headers[index] == "crewId") { ref->idCrew = value; }
	//else if (headers[index] == "crewBaseDt") { ref->dateLoc = utcStrToUtc(value); }
	//else if (headers[index] == "blh") { ref->blh = atoi(value); }
	//else if (headers[index] == "ft") { ref->ft = atoi(value); }
	//else if (headers[index] == "fdp") { ref->fdp = atoi(value); }
	//else if (headers[index] == "dp") { ref->dp = atoi(value); }
	//else if (headers[index] == "nightDp") { ref->NIGHT_DP = atoi(value); }
	//else if (headers[index] == "ground") { ref->GND = atoi(value); }
	//else if (headers[index] == "standby") { ref->STANDBY = atoi(value); }
	//else if (headers[index] == "travel") { ref->TRAVEL = atoi(value); }
	//else if (headers[index] == "credit") { ref->CREDIT = atoi(value); }
	//else if (headers[index] == "fatigue") { ref->FATIGUE = atoi(value); }
	//else if (headers[index] == "pubFt") { }
	//else if (headers[index] == "pubGround") {  }
	//else if (headers[index] == "isLeave") { ref->LEAVE = (0 == memcmp(value, "1", 1) ? 1 : 0); }
	//else if (headers[index] == "isDayOff") { ref->DAY_OFF = ((0 == memcmp(value, "1", 1) ? 1 : 0)); }
	//else if (headers[index] == "custDp") { ref->cust_dp = atoi(value); }
	//else if (headers[index] == "perDiem") { ref->PER_DIEM = atof(value); }
	//else if (headers[index] == "normalWp") { ref->normal_wp = atoi(value); }
	//else if (headers[index] == "extendWp") { ref->extend_wp = atoi(value); }
	//else if (headers[index] == "csb") { ref->CSB = atoi(value); }
	//else if (headers[index] == "hsb") { ref->HSB = atoi(value); }
	//else if (headers[index] == "asb") { ref->ASB = atoi(value); }
	//else if (headers[index] == "lastModified") {}
	//else if (headers[index] == "modifiedBy") {}
	//else if (headers[index] == "isAl") { ref->IS_AL = atoi(value); }
	//else { printfErrorMsgMandayCcHeader(headers[index]); }
}

void* mandayCcAmParser::createInstance() {
	return new CREW_MANDAY_CC_AM();
}

void mandayCcAmParser::deleteInstance(void* obj) {
	delete (CREW_MANDAY_CC_AM*)obj;
}

static vector<string> mandayCcAmDefaultHeaders = { "id", "scenarioId", "crewId", "crewBaseDt", "blh", "ft", "fdp", "dp", "nightDp", "ground", "standby", "travel", "credit", "schCredit", "fatigue", 
//"pubFt", "pubBlh", "pubFdp", "pubDp", "pubNightDp", "pubTravel", "pubCredit", "pubFatigue", "pubLeave", "pubDayOff", "pubStandby", "pubGround", 
"isLeave", "isDayOff", "custDp", "perDiem", "lhPerDiem", "schPerDiem", "schLhPerDiem", "normalWp", "extendWp", "csb", "hsb", "asb", "workingHour", "schWorkingHour","lastModified", "modifiedBy", "isAl" ,"quarantine", "highPlateau", "custData1", "custData2",
"operatingFleets", "operatingAirports", "pncCredit", "simCredit", "alCredit", "olCredit", "freighterCredit", "sbyDp", "dhdDp", "layoverDay", "attributes", "intBlh", "fltNum",
"layoverTimes", "layoverDuration", "crossTzDutyCount", "isDomesticDo", "isFirstRecySixOffsetDdo" };
vector<string>& mandayCcAmParser::getDefaultHeaders() {
	return mandayCcAmDefaultHeaders;
}

/**
代码自动生成fromCsv：
regExp:  .*  --->   else if \(headers\[index\] == \"\0\"\) { }

代码自动生存toCsv：
regExp:  .*  --->   else if \(headers\[i\] == \"\0\"\) { ss << << "^"; }
*/