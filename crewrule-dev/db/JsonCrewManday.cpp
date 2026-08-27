#include <string>
#include <sstream>
#include <algorithm>

#include "JsonPairing.h"
#include "UtilFunc.h"
#include "Log/Logger.h"

int parseJson_CrewMandayLists(const string& type, rapidjson::Value &value, vector<SharedPtr<CREW_MANDAY_BASIC>>& outputList);
static void parseJson_CrewManday(SharedPtr<CREW_MANDAY_BASIC>& item, Value& jsonItem);//飞行
static SharedPtr<CREW_MANDAY_BASIC> parseJson_CrewManday_FD(Value & jsonItem);//飞行
static SharedPtr<CREW_MANDAY_BASIC> parseJson_CrewManday_CC(Value& jsonItem);//客舱
void parseJson_groupManday(vector<SharedPtr<CREW_MANDAY_BASIC>>& list, map<string, map<time_t, SharedPtr<CREW_MANDAY_BASIC>>> &result);

int parseJson_CrewMandayLists(rapidjson::Value &document, map<string, map<time_t, SharedPtr<CREW_MANDAY_BASIC>>> &addOrUpdateMap, map<string, map<time_t, SharedPtr<CREW_MANDAY_BASIC>>> &delMap) {
	int ret = 0;
	vector<SharedPtr<CREW_MANDAY_BASIC>> addOrUpdateList;
	vector<SharedPtr<CREW_MANDAY_BASIC>> delList;
	string type = "";//取值：FD - 飞行、CC - 客舱
	if (document.HasMember("Type")) {
		type = document["Type"].GetString();
	}
	if (document.HasMember("Add")) {
		ret = parseJson_CrewMandayLists(type, document["Add"], addOrUpdateList);
	}
	if (document.HasMember("Delete")) {
		ret = parseJson_CrewMandayLists(type, document["Delete"], delList);
	}
	//group by crew
	parseJson_groupManday(addOrUpdateList, addOrUpdateMap);
	parseJson_groupManday(delList, delMap);
	return ret;
}

void parseJson_groupManday(vector<SharedPtr<CREW_MANDAY_BASIC>>& list, map<string, map<time_t, SharedPtr<CREW_MANDAY_BASIC>>> &result) {

	for (auto& item : list) {
		string crewId = item->idCrew;
		time_t dateLoc = item->dateLoc;
		if (result.find(crewId) == result.end()) {
			result[crewId] = map<time_t, SharedPtr<CREW_MANDAY_BASIC>>();
		}
		result[crewId][dateLoc] = item;
	}
}


int parseJson_CrewMandayLists(const string& type, rapidjson::Value &value, vector<SharedPtr<CREW_MANDAY_BASIC>>& outputList) {
	if (!value.IsArray()) {
		Logger::getRuleLogger()->error("ERROR: invalid json, not a array");
		return ERR_JSON;
	}
	for (SizeType i = 0; i < value.Size(); i++) {
		Value &jsonItem = value[i];
		SharedPtr<CREW_MANDAY_BASIC> item = nullptr;
		if (type == "FD") {
			item = parseJson_CrewManday_FD(jsonItem);
		}
		else if (type == "CC") {
			item = parseJson_CrewManday_CC(jsonItem);
		}
		else {
			item = std::make_shared<CREW_MANDAY_BASIC>();
			parseJson_CrewManday(item, jsonItem);
		}

		if (item) {
			outputList.push_back(item);
		}
	}
	return 0;
}


#define PARSE_JASON_INT(value) value.IsString() ? atoi(value.GetString()) : value.GetInt()
#define PARSE_JASON_DOUBLE(value) value.IsString() ? atof(value.GetString()) : value.GetDouble()
SharedPtr<CREW_MANDAY_BASIC> parseJson_CrewManday_FD(Value& jsonItem) {

	SharedPtr<CREW_MANDAY_FD> item = std::make_shared<CREW_MANDAY_FD>();

	if (jsonItem.HasMember("augumentBlh")) item->augBlh = jsonItem["augumentBlh"].GetDouble();
	if (jsonItem.HasMember("doubleBlh")) item->doubleBlh = jsonItem["doubleBlh"].GetInt();
	if (jsonItem.HasMember("augumentFt")) item->augumentFt = jsonItem["augumentFt"].GetInt();
	if (jsonItem.HasMember("doubleFt")) item->doubleBlh = jsonItem["doubleFt"].GetInt();
	if (jsonItem.HasMember("nightDp")) item->nightDp = jsonItem["nightDp"].GetInt();
	if (jsonItem.HasMember("travel")) item->travel = jsonItem["travel"].GetInt();
	if (jsonItem.HasMember("fatigue")) item->fatigue = jsonItem["fatigue"].GetInt();

	if (jsonItem.HasMember("actTakeOffs")) item->actTakeOffs = jsonItem["actTakeOffs"].GetInt();
	if (jsonItem.HasMember("actLandings")) item->actLandings = jsonItem["actLandings"].GetInt();

	//if (jsonItem.HasMember("pubBlh")) item->pubBlh = jsonItem["pubBlh"].GetInt();
	//if (jsonItem.HasMember("pubAugBlh")) item->pubAugBlh = jsonItem["pubAugBlh"].GetInt();
	//if (jsonItem.HasMember("pubDobBlh")) item->pubDobBlh = jsonItem["pubDobBlh"].GetInt();
	//if (jsonItem.HasMember("pubFdp")) item->pubFdp = jsonItem["pubFdp"].GetInt();
	//if (jsonItem.HasMember("pubDp")) item->pubDp = jsonItem["pubDp"].GetInt();
	//if (jsonItem.HasMember("pubNightDp")) item->pubNightDp = jsonItem["pubNightDp"].GetInt();
	//if (jsonItem.HasMember("pubTravel")) item->pubTravel = jsonItem["pubTravel"].GetInt();
	//if (jsonItem.HasMember("pubCredit")) item->pubCredit = jsonItem["pubCredit"].GetInt();

	if (jsonItem.HasMember("updowns")) item->updowns = jsonItem["updowns"].GetInt();
	if (jsonItem.HasMember("cat2Updowns")) item->cat2Updowns = jsonItem["cat2Updowns"].GetInt();
	if (jsonItem.HasMember("expBlh")) item->expBlh = jsonItem["expBlh"].GetInt();

	if (jsonItem.HasMember("takeoff")) item->takeoff = jsonItem["takeoff"].GetInt();
	if (jsonItem.HasMember("landing")) item->landing = jsonItem["landing"].GetInt();

	//if (jsonItem.HasMember("idUser")) item->idCrew = string(jsonItem["idUser"].GetString());

	//if (jsonItem.HasMember("tmst")) {
	//	if (jsonItem["tmst"].IsString())
	//		item->tmst = utcStrToUtc((char*)jsonItem["tmst"].GetString());
	//	else
	//		item->tmst = jsonItem["tmst"].GetInt64();
	//}
	auto baseItem = std::static_pointer_cast<CREW_MANDAY_BASIC>(item);
	parseJson_CrewManday(baseItem, jsonItem);
	return baseItem;
}

SharedPtr<CREW_MANDAY_BASIC> parseJson_CrewManday_CC(Value& jsonItem) {

	SharedPtr<CREW_MANDAY_CC_AM> item = std::make_shared<CREW_MANDAY_CC_AM>();

	if (jsonItem.HasMember("nightDp")) item->NIGHT_DP = jsonItem["nightDp"].GetInt();
	if (jsonItem.HasMember("travel")) item->TRAVEL = jsonItem["travel"].GetInt();
	if (jsonItem.HasMember("fatigue")) item->FATIGUE = jsonItem["fatigue"].GetInt();

	//if (jsonItem.HasMember("idUser")) item->idCrew = string(jsonItem["idUser"].GetString());

	//if (jsonItem.HasMember("tmst")) {
	//	if (jsonItem["tmst"].IsString())
	//		item->tmst = utcStrToUtc((char*)jsonItem["tmst"].GetString());
	//	else
	//		item->tmst = jsonItem["tmst"].GetInt64();
	//}
	auto baseItem = std::static_pointer_cast<CREW_MANDAY_BASIC>(item);
	parseJson_CrewManday(baseItem, jsonItem);
	return baseItem;
}


void parseJson_CrewManday(SharedPtr<CREW_MANDAY_BASIC>& item, Value& jsonItem) {

	if (jsonItem.HasMember("idScenario")) item->idScenario = jsonItem["idScenario"].GetInt64();
	if (jsonItem.HasMember("idcrew")) item->idCrew = string(jsonItem["idcrew"].GetString());
	if (jsonItem.HasMember("division")) item->division = jsonItem["division"].GetInt();


	if (jsonItem.HasMember("blh")) item->blh = jsonItem["blh"].GetDouble();
	if (jsonItem.HasMember("dayOff")) item->DAY_OFF = jsonItem["dayOff"].GetInt();
	if (jsonItem.HasMember("isDomesticDo")) item->isDomesticDo = jsonItem["isDomesticDo"].GetInt();
	if (jsonItem.HasMember("isFirstRecySixOffsetDdo")) item->isFirstRecy6Offsetddo = (jsonItem["isFirstRecySixOffsetDdo"].GetInt() == 1);
	if (jsonItem.HasMember("leave")) item->LEAVE = jsonItem["leave"].GetInt();
	if (jsonItem.HasMember("leaveDuration")) item->leaveDuration = jsonItem["leaveDuration"].GetInt();

	
	if (jsonItem.HasMember("isPosition")) item->IS_POSITION = jsonItem["isPosition"].GetInt();
	if (jsonItem.HasMember("ground")) item->GND = jsonItem["ground"].GetInt();
	if (jsonItem.HasMember("groundDuration")) item->groundDuration = jsonItem["groundDuration"].GetInt();


	if (jsonItem.HasMember("standby")) item->STANDBY = jsonItem["standby"].GetInt();
	if (jsonItem.HasMember("standbyDuration")) item->standbyDuration = jsonItem["standbyDuration"].GetInt();
	if (jsonItem.HasMember("dp")) item->dp = jsonItem["dp"].GetDouble();
	if (jsonItem.HasMember("fdp")) item->fdp = jsonItem["fdp"].GetDouble();
	if (jsonItem.HasMember("ft")) item->ft = jsonItem["ft"].GetDouble();
	if (jsonItem.HasMember("csb")) item->CSB = jsonItem["csb"].GetInt();
	if (jsonItem.HasMember("asb")) item->ASB = jsonItem["asb"].GetInt();

	if (jsonItem.HasMember("hsb")) item->HSB = jsonItem["hsb"].GetInt();

	if (jsonItem.HasMember("custDp")) item->cust_dp = jsonItem["custDp"].GetDouble();
	if (jsonItem.HasMember("sbyDp")) item->SBY_DP = jsonItem["sbyDp"].GetDouble();
	if (jsonItem.HasMember("dhdDp")) item->DHD_DP = jsonItem["dhdDp"].GetDouble();

	if (jsonItem.HasMember("wpNormal")) item->normal_wp = jsonItem["wpNormal"].GetDouble();
	if (jsonItem.HasMember("wpExtend")) item->extend_wp = jsonItem["wpExtend"].GetDouble();

	if (jsonItem.HasMember("perDiem")) item->PER_DIEM = jsonItem["perDiem"].GetDouble();
	if (jsonItem.HasMember("lhPerDiem")) item->LONG_PER_DIEM = jsonItem["lhPerDiem"].GetDouble();
	if (jsonItem.HasMember("workingHour")) item->workingHour = jsonItem["workingHour"].GetDouble();
	if (jsonItem.HasMember("credit")) item->credit = jsonItem["credit"].GetDouble();
	if (jsonItem.HasMember("pncCredit")) item->credit_pnc = jsonItem["pncCredit"].GetDouble();
	if (jsonItem.HasMember("simCredit")) item->credit_sim = jsonItem["simCredit"].GetDouble();
	if (jsonItem.HasMember("alCredit")) item->credit_al = jsonItem["alCredit"].GetDouble();
	if (jsonItem.HasMember("olCredit")) item->credit_ol = jsonItem["olCredit"].GetDouble();
	if (jsonItem.HasMember("freighterCredit")) item->credit_freighter = jsonItem["freighterCredit"].GetDouble();
	if (jsonItem.HasMember("schPerDiem")) item->SCH_PER_DIEM = jsonItem["schPerDiem"].GetDouble();
	if (jsonItem.HasMember("schLhPerDiem")) item->SCH_LONG_PER_DIEM = jsonItem["schLhPerDiem"].GetDouble();
	if (jsonItem.HasMember("schWorkingHour")) item->schWorkingHour = jsonItem["schWorkingHour"].GetDouble();
	if (jsonItem.HasMember("schCredit")) item->sch_credit = jsonItem["schCredit"].GetDouble();
	if (jsonItem.HasMember("schPncCredit")) item->sch_credit_pnc = jsonItem["schPncCredit"].GetDouble();
	if (jsonItem.HasMember("schSimCredit")) item->sch_credit_sim = jsonItem["schSimCredit"].GetDouble();
	if (jsonItem.HasMember("schAlCredit")) item->sch_credit_al = jsonItem["schAlCredit"].GetDouble();
	if (jsonItem.HasMember("schOlCredit")) item->sch_credit_ol = jsonItem["schOlCredit"].GetDouble();
	if (jsonItem.HasMember("schFreighterCredit")) item->sch_credit_freighter = jsonItem["schFreighterCredit"].GetDouble();

	if (jsonItem.HasMember("layoverDay")) item->layover_day = jsonItem["layoverDay"].GetInt();
	if (jsonItem.HasMember("operatingFleets")) {
		item->operating_fleets.clear();
		split(jsonItem["operatingFleets"].GetString(), '|', item->operating_fleets);
	}
	if (jsonItem.HasMember("operatingAirports")) {
		item->operating_airports.clear();
		split(jsonItem["operatingAirports"].GetString(), '|', item->operating_airports);
	}
	if (jsonItem.HasMember("fleetTakeoff")) {
		item->fleetTakeoff.clear();
		split(jsonItem["fleetTakeoff"].GetString(), '|', item->fleetTakeoff);
	}
	if (jsonItem.HasMember("fleetLanding")) {
		item->fleetLanding.clear();
		split(jsonItem["fleetLanding"].GetString(), '|', item->fleetLanding);
	}
	if (jsonItem.HasMember("nightFleetTakeoff")) {
		item->nightFleetTakeoff.clear();
		split(jsonItem["nightFleetTakeoff"].GetString(), '|', item->nightFleetTakeoff);
	}
	if (jsonItem.HasMember("nightFleetLanding")) {
		item->nightFleetLanding.clear();
		split(jsonItem["nightFleetLanding"].GetString(), '|', item->nightFleetLanding);
	}

	if (jsonItem.HasMember("isAl")) item->IS_AL = jsonItem["isAl"].GetInt();
	if (jsonItem.HasMember("al")) item->al = jsonItem["al"].GetInt();
	if (jsonItem.HasMember("quarantine")) item->QUARANTINE = jsonItem["quarantine"].GetInt();
	if (jsonItem.HasMember("quarantineDuration")) item->quarantineDuration = jsonItem["quarantineDuration"].GetInt();
	if (jsonItem.HasMember("custData1")) item->custData1 = jsonItem["custData1"].GetDouble();
	if (jsonItem.HasMember("custData2")) item->custData2 = jsonItem["custData2"].GetDouble();
	if (jsonItem.HasMember("highPlateau")) item->HIGH_PLATEAU = jsonItem["highPlateau"].GetInt();

	if (jsonItem.HasMember("layoverTimes")) item->layoverTimes = jsonItem["layoverTimes"].GetInt();
	if (jsonItem.HasMember("layoverDuration")) item->layoverDuration = jsonItem["layoverDuration"].GetInt();
	if (jsonItem.HasMember("crossTzDutyCount")) item->crossTzDutyCount = jsonItem["crossTzDutyCount"].GetInt();
	//if (jsonItem.HasMember("other")) item->ot = jsonItem["other"].GetInt();

	//time_t crewDateUtc = 0; //DATE
	// 
	//自适应 timestamp/ yyyy-MM-dd
	if (jsonItem.HasMember("crewDate")) {
		if (jsonItem["crewDate"].IsString())
			item->dateLoc = utcStrToUtc((char*)jsonItem["crewDate"].GetString());
		else
			item->dateLoc = jsonItem["crewDate"].GetInt64();
	}
}