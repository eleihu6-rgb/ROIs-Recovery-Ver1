#include <sstream>
#include "Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"
#include "JsonLive.h"
//#include "rapidjson\document.h"		// rapidjson's DOM-style API

using namespace rapidjson;

static vector<string> ScenarioDefaultHeaders = { "worksetId", "airline", "version", "action", "status",
"processId", "strDtLoc", "endDtLoc", "pairingBaseIds", "crewBaseIds", "crewMainBaseIds", "rankIds", "actingRankId", 
"fleetIds", "pairingFleetIds", "pairingRankIds", "runModeIds", "ttId", "tttIds", "assignmentGroupIds", "paIds", "qualificationIds", 
"languageIds", "pairingScenarioId", "ruleSetId", "cqfSetId", "isFavorite", "isPublic", "category",
"type", "isSelected", "inParent", "loadLeadInOut", "deviceBookingType" };
vector<string>& scenarioParser::getDefaultHeaders() {
	return ScenarioDefaultHeaders;
}

void scenarioParser::init(vector<string>& headers) {}

void* scenarioParser::createInstance() {
	return new Scenario();
}

void scenarioParser::deleteInstance(void* obj) {
	delete (Scenario*)obj;
}

string scenarioParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	Scenario * ref = (Scenario *)obj;
	//"", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "worksetId") { ss << ref->scenarioId << "^"; }
		else if (headers[i] == "airline") { ss << ref->airline << "^"; }
		else if (headers[i] == "version") { ss << ref->version << "^"; }
		else if (headers[i] == "action") { ss << "^"; }
		else if (headers[i] == "status") { ss << ref->status << "^"; }
		else if (headers[i] == "processId") { ss << "^"; }
		else if (headers[i] == "strDtLoc") { ss << utcToUtcDtString(ref->startDtLoc) << "^"; }
		else if (headers[i] == "endDtLoc") { ss << utcToUtcDtString(ref->endDtLoc) << "^"; }
		else if (headers[i] == "pairingBaseIds") { ss << joinIntList(ref->baseIds,",") << "^"; }
		else if (headers[i] == "crewBaseIds") { ss << joinIntList(ref->crewBaseIds, ",") << "^"; }
		else if (headers[i] == "crewMainBaseIds") { ss << joinIntList(ref->crewBaseIds, ",") << "^"; }
		else if (headers[i] == "rankIds") { ss << joinIntList(ref->rankIds, ",") << "^"; }
		else if (headers[i] == "pairingRankIds") { ss << joinIntList(ref->rankIds, ",") << "^"; }
		else if (headers[i] == "actingRankId") {
			if (!isEqualIntList(ref->actingRankIds, ref->rankIds)) { ss << joinIntList(ref->actingRankIds, ","); } 
			ss << "^";
		}
		else if (headers[i] == "fleetIds") { ss << joinIntList(ref->fleetIds, ",") << "^"; }
		else if (headers[i] == "pairingFleetIds") { ss << joinIntList(ref->fleetIds, ",") << "^"; }
		else if (headers[i] == "runModeIds") { ss << joinIntList(ref->runMode, ",") << "^"; }///runMode
		else if (headers[i] == "ttId") { ss << ref->idTT << "^"; }
		else if (headers[i] == "tttIds") { ss << ref->idTTT << "^"; }
		else if (headers[i] == "assignmentGroupIds") { ss << ref->assignmentGroupId << "^"; }
		else if (headers[i] == "paIds") { ss << ref->paList << "^"; }
		else if (headers[i] == "qualificationIds") { ss << joinIntList(ref->qualificationIds, ",") << "^"; }
		else if (headers[i] == "languageIds") { ss << ref->languageId << "^"; }
		else if (headers[i] == "pairingScenarioId") { ss << ref->idScenarioPair << "^"; }
		else if (headers[i] == "ruleSetId") { ss << ref->idRuleSet << "^"; }
		else if (headers[i] == "cqfSetId") { ss << ref->idCQSet << "^"; }
		else if (headers[i] == "isFavorite") { ss << "^"; }
		else if (headers[i] == "isPublic") { ss << "^"; }		
		else if (headers[i] == "category") { ss << "^"; }
		else if (headers[i] == "type") { ss << "^"; }
		else if (headers[i] == "isSelected") { ss << "^"; }
		else if (headers[i] == "inParent") { ss << "^"; }
		else if (headers[i] == "loadLeadInOut") { ss << "^"; }
		else if (headers[i] == "filterCrewCountry") { ss << "^"; }
		else if (headers[i] == "filterCrewQual") { ss << "^"; }
		else if (headers[i] == "filterCrewPosition") { ss << "^"; }
		else if (headers[i] == "filterCrewTeam") { ss << "^"; }
		else if (headers[i] == "fltSchId") { ss << "^"; }
		else if (headers[i] == "pairingScenarioId") { ss << "^"; }
		else if (headers[i] == "loadType") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "deviceBookingType") {ss << static_cast<unsigned int>(ref->_deviceBookingType) << "^";}

		else { logUnkonwnField("scenario", headers[i]); }
	}
	return ss.str();
}

void scenarioParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	Scenario * ref = (Scenario *)obj;

	if (headers[index] == "workSetId") { ref->scenarioId = atoll(value); }
	else if (headers[index] == "worksetId") { ref->scenarioId = atoll(value); }
	else if (headers[index] == "airline") { ref->airline = value; }
	else if (headers[index] == "version") { ref->version = atoi(value); }
	else if (headers[index] == "name") {  }
	else if (headers[index] == "action") {  }
	else if (headers[index] == "status") { ref->status = value; }
	else if (headers[index] == "processId") {  }
	else if (headers[index] == "strDtLoc") { ref->startDtUTC = localToUtc(utcStrToUtc(value)); ref->startDtLoc = utcStrToUtc(value); }
	else if (headers[index] == "endDtLoc") { ref->endDtUTC = localToUtc(utcStrToUtc(value)); ref->endDtLoc = utcStrToUtc(value); }
	else if (headers[index] == "pairingBaseIds") { split(value, ',', ref->baseIds); }
	else if (headers[index] == "crewBaseIds") { split(value, ',', ref->crewBaseIds); } // 3.0 新数据结构
	else if (headers[index] == "crewMainBaseIds") { split(value, ',', ref->crewBaseIds); }
	else if (headers[index] == "rankIds") { split(value, ',', ref->rankIds); }
	else if (headers[index] == "actingRankId") { split(value, ',', ref->actingRankIds); }
	else if (headers[index] == "pairingRankIds") { split(value, ',', ref->rankIds); } // 3.0 新数据结构
	else if (headers[index] == "fleetIds") { split(value, ',', ref->fleetIds); }
	else if (headers[index] == "pairingFleetIds") { split(value, ',', ref->fleetIds); } // 3.0 新数据结构
	else if (headers[index] == "runModeIds") { split(value, ',', ref->runMode); }///runMode
	else if (headers[index] == "ttId") { ref->idTT = atoll(value) ; }
	else if (headers[index] == "tttIds") { ref->idTTT = value; }//idTTT type is string
	else if (headers[index] == "assignmentGroupIds") { ref->assignmentGroupId = value; }///ScenarioGroupIds
	else if (headers[index] == "paIds") { ref->paList = value; }
	else if (headers[index] == "tagIds") { ref->tagIds = value; }
	else if (headers[index] == "qualificationIds") { split(value, ',', ref->qualificationIds); }
	else if (headers[index] == "languageIds") { ref->languageId = value; }
	else if (headers[index] == "pairingScenarioId") { ref->idScenarioPair = atoll(value); }
	else if (headers[index] == "ruleSetId") { ref->idRuleSet = atoll(value); }
	else if (headers[index] == "cqfSetId") { ref->idCQSet = atoll(value); }
	else if (headers[index] == "rankCross") { ref->rankCross = value; }
	else if (headers[index] == "isFavorite") { }
	else if (headers[index] == "isPublic") {}
	else if (headers[index] == "category") {}
	else if (headers[index] == "type") {}
	else if (headers[index] == "isSelected") {}
	else if (headers[index] == "inParent") {}
	else if (headers[index] == "loadLeadInOut") {}
	else if (headers[index] == "filterCrewCountry") {}
	else if (headers[index] == "filterCrewQual") {}
	else if (headers[index] == "filterCrewPosition") {}
	else if (headers[index] == "filterCrewTeam") {}
	else if (headers[index] == "fltSchId") {}
	else if (headers[index] == "pairingScenarioId") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "ferryId") {}
	else if (headers[index] == "loadType") { ref->loadType = value; }
	else if (headers[index] == "crewSex") {}
	else if (headers[index] == "crewAge") {}
	else if (headers[index] == "crewTeamIds") {}
	else if (headers[index] == "crewPositionIds") {}
	else if (headers[index] == "crewBaseRelation") {}
	else if (headers[index] == "crewFirstQualIds") {}
	else if (headers[index] == "crewSecondQualIds") {}
	else if (headers[index] == "crewThirdQualIds") {}
	else if (headers[index] == "crewQualRelation") {}
	else if (headers[index] == "crewRankIds") {}
	else if (headers[index] == "crewFleetIds") {}
	else if (headers[index] == "crewCountryIds") {}
	else if (headers[index] == "crewAssistantBaseIds") {}
	else if (headers[index] == "division") {}
	else if (headers[index] == "comments") {}
	else if (headers[index] == "optimizedCount") {}
	else if (headers[index] == "live") {}
	else if (headers[index] == "jsonLive") { 
		//3.0
		if (string(value) != "") {
			Document d;
			d.Parse<0>(value);
			if (d.HasParseError() && !d.IsArray()) {
				cout << "parse jsonLive error!\n";
			}
			parseJson_Live(d,ref);
		}
	}
	else if (headers[index] == "leadInLive") {}
	else if (headers[index] == "deviceBookingType" && !(value == nullptr || value[0] == '\0')) {
		ref->_deviceBookingType = static_cast<Scenario::DeviceBookingType>(atoi(value));
	}

	else { logUnkonwnField("scenario", headers[index]); }
}

