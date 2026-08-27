#include <sstream>
#include <memory.h>
#include "../CrewDB.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "csv_impl.h"

void mandayFdParser::init(vector<string>& headers) {}


string mandayFdParser::toCsv(vector<string>& headers, void* obj) {
	//"id", "crewId", "", "effDt", "expDt
	stringstream ss;
	CREW_MANDAY_FD * ref = (CREW_MANDAY_FD *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "scenarioId") { ss << ref->idScenario << "^"; }
		else if (headers[i] == "crewId") { ss << ref->idCrew << "^"; }
		else if (headers[i] == "crewBaseDt") { ss << (ref->dateLoc != 0 ? utcToUtcDtString(ref->dateLoc) : utcToUtcDtString(ref->dateLoc)) << "^"; }
		else if (headers[i] == "blh") { ss << (int)round(ref->blh) << "^"; }
		else if (headers[i] == "ft") { ss << (int)round(ref->ft) << "^"; }
		else if (headers[i] == "fdp") { ss << (int)round(ref->fdp) << "^"; }
		else if (headers[i] == "dp") { ss << (int)round(ref->dp) << "^"; }
		else if (headers[i] == "nightDp") { ss << (int)round(ref->nightDp) << "^"; }
		else if (headers[i] == "ground") { ss << ref->GND << "^"; }
		else if (headers[i] == "standby") { ss << ref->STANDBY << "^"; }
		else if (headers[i] == "travel") { ss << ref->travel << "^"; }

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
		else if (headers[i] == "updowns") { ss << ref->updowns << "^"; }
		else if (headers[i] == "cat2Updowns") { ss << ref->cat2Updowns << "^"; }
		else if (headers[i] == "takeoff") { ss << ref->takeoff << "^"; }
		else if (headers[i] == "landing") { ss << ref->landing << "^"; }
		else if (headers[i] == "expBlh") { ss << ref->expBlh << "^"; }
		else if (headers[i] == "custData1") { ss << ref->custData1 << "^"; }
		else if (headers[i] == "custData2") { ss << ref->custData2 << "^"; }
		else if (headers[i] == "highPlateau") { ss << ref->HIGH_PLATEAU << "^"; }
		else if (headers[i] == "operatingFleets") { ss << joinMapToStr(ref->operating_fleets, "|") << "^"; }
		else if (headers[i] == "operatingAirports") { ss << joinStrList(ref->operating_airports, "|") << "^"; }
		else if (headers[i] == "fleetTakeoff") { ss << joinMapToStr(ref->fleetTakeoff, "|") << "^"; }
		else if (headers[i] == "fleetLanding") { ss << joinMapToStr(ref->fleetLanding, "|") << "^"; }
		else if (headers[i] == "nightTakeoff") { ss << joinMapToStr(ref->nightFleetTakeoff, "|") << "^"; }
		else if (headers[i] == "nightLanding") { ss << joinMapToStr(ref->nightFleetLanding, "|") << "^"; }
		else if (headers[i] == "isPosition") { ss << ref->IS_POSITION << "^"; }
		else if (headers[i] == "sbyDp") { ss << (int)round(ref->SBY_DP) << "^";}
		else if (headers[i] == "dhdDp") { ss << (int)round(ref->DHD_DP) << "^";}
		else if (headers[i] == "layoverDay") { ss << ref->layover_day << "^";}
		else if (headers[i] == "augumentFt") { ss << ref->augumentFt << "^"; }
		else if (headers[i] == "doubleFt") { ss << ref->doubleFt << "^"; }
		else if (headers[i] == "augumentBlh") { ss << (int)round(ref->augBlh) << "^"; }
		else if (headers[i] == "doubleBlh") { ss << ref->doubleBlh << "^"; }
		else if (headers[i] == "fatigue") { ss << ref->fatigue << "^"; }
		else if (headers[i] == "attributes") { ss << ref->attributes << "^"; }
		else if (headers[i] == "intBlh") { ss << ref->intBlh << "^"; }
		else if (headers[i] == "fltNum") { ss << ref->fltNum << "^"; }
		else if (headers[i] == "radiationDose") { ss << ref->radiationDose << "^"; }

		else if (headers[i] == "layoverTimes") { ss << ref->layoverTimes << "^"; }
		else if (headers[i] == "layoverDuration") { ss << ref->layoverDuration << "^"; }
		else if (headers[i] == "crossTzDutyCount") { ss << ref->crossTzDutyCount << "^"; }
		else if (headers[i] == "isDomesticDo") { ss << (ref->isDomesticDo == DAY_OFF_EXIST ? DAY_OFF_EXIST : DAY_OFF_NOT_EXIST) << "^"; }
		else if (headers[i] == "isFirstRecySixOffsetDdo") { ss << (ref->isFirstRecy6Offsetddo ? "1" : "0") << "^"; }
		else { logUnkonwnField("crew_manday_fd", headers[i]); }
	}
	return ss.str();
}

void mandayFdParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CREW_MANDAY_FD * ref = (CREW_MANDAY_FD *)obj;
	if (headers[index] == "id") {}
	else if (headers[index] == "scenarioId") { ref->idScenario = atoll(value); }
	else if (headers[index] == "crewId") { ref->idCrew = value; }
	else if (headers[index] == "crewBaseDt") { ref->dateLoc = utcStrToUtc(value); }
	else if (headers[index] == "blh") { ref->blh = atoi(value); }
	else if (headers[index] == "ft") { ref->ft = atoi(value); }
	else if (headers[index] == "fdp") { ref->fdp = atoi(value); }
	else if (headers[index] == "dp") { ref->dp = atoi(value); }
	else if (headers[index] == "nightDp") { ref->nightDp = atoi(value); }
	else if (headers[index] == "ground") { ref->GND = atoi(value); }
	else if (headers[index] == "standby") { ref->STANDBY = atoi(value); }
	else if (headers[index] == "travel") { ref->travel = atoi(value); }

	else if (headers[index] == "credit") { ref->credit = atof(value); }
	else if (headers[index] == "pncCredit") { ref->credit_pnc = atof(value); }
	else if (headers[index] == "simCredit") { ref->credit_sim = atof(value); }
	else if (headers[index] == "alCredit") { ref->credit_al = atof(value); }
	else if (headers[index] == "olCredit") { ref->credit_ol = atof(value); }
	else if (headers[index] == "freighterCredit") { ref->credit_freighter = atof(value); }
	else if (headers[index] == "schCredit") { ref->sch_credit = atof(value); }
	else if (headers[index] == "schPncCredit") { ref->sch_credit_pnc = atof(value); }
	else if (headers[index] == "schSimCredit") { ref->sch_credit_sim = atof(value); }
	else if (headers[index] == "schAlCredit") { ref->sch_credit_al = atof(value); }
	else if (headers[index] == "schOlCredit") { ref->sch_credit_ol = atof(value); }
	else if (headers[index] == "schFreighterCredit") { ref->sch_credit_freighter = atof(value); }


	else if (headers[index] == "isLeave") { ref->LEAVE = (0 == memcmp(value, "1", 1) ? 1 : 0); }
	else if (headers[index] == "isDayOff") { ref->DAY_OFF = ((0 == memcmp(value, "1", 1) ? 1 : 0)); }
	else if (headers[index] == "isPosition") { ref->IS_POSITION = ((0 == memcmp(value, "1", 1) ? 1 : 0)); }
	else if (headers[index] == "custDp") { ref->cust_dp = atoi(value); }
	
	else if (headers[index] == "perDiem") { ref->PER_DIEM = atof(value); }
	else if (headers[index] == "lhPerDiem") { ref->LONG_PER_DIEM = atof(value); }
	else if (headers[index] == "schPerDiem") { ref->SCH_PER_DIEM = atof(value); }
	else if (headers[index] == "schLhPerDiem") { ref->SCH_LONG_PER_DIEM = atof(value); }

	else if (headers[index] == "normalWp") { ref->normal_wp = atoi(value); }
	else if (headers[index] == "extendWp") { ref->extend_wp = atoi(value); }
	else if (headers[index] == "csb") { ref->CSB = atoi(value); }
	else if (headers[index] == "hsb") { ref->HSB = atoi(value); }
	else if (headers[index] == "asb") { ref->ASB = atoi(value); }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "isAl") { ref->IS_AL = atoi(value); }
	else if (headers[index] == "quarantine") { ref->QUARANTINE = atoi(value); }
	else if (headers[index] == "custData1") { ref->custData1 = atof(value); }
	else if (headers[index] == "custData2") { ref->custData2 = atof(value); }
	else if (headers[index] == "updowns") { ref->updowns = atoi(value); }
	else if (headers[index] == "cat2Updowns") { ref->cat2Updowns = atoi(value); }
	else if (headers[index] == "takeoff") { ref->takeoff = atoi(value); }
	else if (headers[index] == "landing") { ref->landing = atoi(value); }
	else if (headers[index] == "expBlh") { ref->expBlh = atoi(value); }
	else if (headers[index] == "highPlateau") { ref->HIGH_PLATEAU = atoi(value); }
	else if (headers[index] == "operatingFleets") { 
		ref->operating_fleets.clear();
		split(value, '|', ref->operating_fleets);
	}
	else if (headers[index] == "operatingAirports") {
		ref->operating_airports.clear();
		split(value, '|', ref->operating_airports);
	}
	else if (headers[index] == "fleetTakeoff") {
		ref->fleetTakeoff.clear();
		split(value, '|', ref->fleetTakeoff);
	}
	else if (headers[index] == "fleetLanding") {
		ref->fleetLanding.clear();
		split(value, '|', ref->fleetLanding);
	}
	else if (headers[index] == "nightTakeoff") {
		ref->nightFleetTakeoff.clear();
		split(value, '|', ref->nightFleetTakeoff);
	}
	else if (headers[index] == "nightLanding") {
		ref->nightFleetLanding.clear();
		split(value, '|', ref->nightFleetLanding);
	}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "augumentFt") { ref->augumentFt = atoi(value); }
	else if (headers[index] == "doubleFt") { ref->doubleFt = atoi(value); }
	else if (headers[index] == "augumentBlh") { ref->augBlh = atof(value); }
	else if (headers[index] == "doubleBlh") { ref->doubleBlh = atoi(value); }
	else if (headers[index] == "fatigue") { ref->fatigue = atoi(value); }
	else if (headers[index] == "actTakeOffs") {}
	else if (headers[index] == "actLandings") {}
	else if (headers[index] == "fleet") {}
	else if (headers[index] == "actingRank") {}
	else if (headers[index] == "workingHour") { ref->workingHour = atof(value);	}
	else if (headers[index] == "schWorkingHour") { ref->schWorkingHour = atof(value); }
	else if (headers[index] == "sbyDp") { ref->SBY_DP = atof(value); }
	else if (headers[index] == "dhdDp") { ref->DHD_DP = atof(value); }
	else if (headers[index] == "layoverDay") { ref->layover_day = atoi(value); }
	else if (headers[index] == "attributes") { ref->attributes = value; }
	else if (headers[index] == "intBlh") { ref->intBlh = atoi(value); }
	else if (headers[index] == "fltNum") { ref->fltNum = atoi(value); }
	else if (headers[index] == "radiationDose") { ref->radiationDose = atof(value); }

	else if (headers[index] == "layoverTimes") { ref->layoverTimes = atoi(value); }
	else if (headers[index] == "layoverDuration") { ref->layoverDuration = atoi(value); }
	else if (headers[index] == "crossTzDutyCount") { ref->crossTzDutyCount = atoi(value); }
	else if (headers[index] == "isDomesticDo") { ref->isDomesticDo = atoi(value); }
	else if (headers[index] == "isFirstRecySixOffsetDdo") { ref->isFirstRecy6Offsetddo = (0 == memcmp(value, "1", 1) ? true : false); }
	else { logUnkonwnField("crew_manday_fd", headers[index]); }
}

void* mandayFdParser::createInstance() {
	return new CREW_MANDAY_FD();
}

void mandayFdParser::deleteInstance(void* obj) {
	delete (CREW_MANDAY_FD*)obj;
}

static vector<string> mandayFdDefaultHeaders = { "id","scenarioId","crewId","crewBaseDt","blh","ft","fdp","dp","nightDp","ground","standby","travel","credit","isLeave",
"isDayOff","custDp","perDiem","lhPerDiem","normalWp","extendWp","csb","hsb","asb","workingHour","lastModified","modifiedBy","isAl","quarantine", "updowns", "cat2Updowns","takeoff", "landing", "expBlh", "highPlateau", "custData1", "custData2",
"operatingFleets", "operatingAirports", "isPosition", "pncCredit", "simCredit", "alCredit", "olCredit", "freighterCredit", "sbyDp", "dhdDp","fleetTakeoff" ,"fleetLanding", "nightTakeoff", "nightLanding", 
"augumentFt", "doubleFt", "augumentBlh", "doubleBlh","fatigue", "attributes", "intBlh", "fltNum", "layoverTimes", "layoverDuration", "crossTzDutyCount", "isDomesticDo", "isFirstRecySixOffsetDdo" };
vector<string>& mandayFdParser::getDefaultHeaders() {
	return mandayFdDefaultHeaders;
}