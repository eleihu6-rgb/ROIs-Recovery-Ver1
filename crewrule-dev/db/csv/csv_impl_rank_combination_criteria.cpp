#include <sstream>
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void rankCombinationCriteriaParser::init(vector<string>& headers) {}


static vector<string> rankCombinationCriteriaDefaultHeaders = { "id", "airline", "division", "pri", "fleets", "routeId", "crewNum", "assignment", "effDt", "expDt", "combinationName", "crewNumRanks" };
vector<string>& rankCombinationCriteriaParser::getDefaultHeaders() {
	return rankCombinationCriteriaDefaultHeaders;
}

void* rankCombinationCriteriaParser::createInstance() {
	return new RankCombinationCriteria();
}

void rankCombinationCriteriaParser::deleteInstance(void* obj) {
	delete (RankCombinationCriteria*)obj;
}

string rankCombinationCriteriaParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	RankCombinationCriteria * ref = (RankCombinationCriteria *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "airline") { ss << ref->airline << "^"; }
		else if (headers[i] == "division") { ss << ref->division << "^"; }
		else if (headers[i] == "pri") { ss << ref->pri << "^"; }
		else if (headers[i] == "fleets") { ss << ref->fleets << "^"; }
		else if (headers[i] == "routeId") { ss << ref->routeId << "^"; }
		else if (headers[i] == "crewNum") { ss << ref->crewNum << "^"; }
		else if (headers[i] == "assignment") { ss << ref->assignment << "^"; }
		else if (headers[i] == "effDt") { ss << ref->effDt << "^"; }
		else if (headers[i] == "expDt") { ss << ref->expDt << "^"; }
		else if (headers[i] == "combinationName") { ss << "^"; }
		else if (headers[i] == "crewNumRanks") { ss << ref->crewNumRanks << "^"; }
		else { logUnkonwnField("rank_combination_criteria", headers[i]); }
	}
	return ss.str();
}

void rankCombinationCriteriaParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	RankCombinationCriteria * ref = (RankCombinationCriteria *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "airline") { ref->airline = value; }
	else if (headers[index] == "division") { ref->division = value; }
	else if (headers[index] == "pri") { ref->pri = atoi(value); }
	else if (headers[index] == "fleets") { ref->fleets = value; }
	else if (headers[index] == "routeId") { ref->routeId = atoll(value); }
	else if (headers[index] == "crewNum") { ref->crewNum = atoi(value); }
	else if (headers[index] == "assignment") { ref->assignment = value; split(value, '|', ref->assignmentVec); } //matnis#5222
	else if (headers[index] == "effDt") { ref->effDt = utcStrToUtc(value); }
	else if (headers[index] == "expDt") { ref->expDt = utcStrToUtc(value); }
	else if (headers[index] == "combinationName") { }
	else if (headers[index] == "crewNumRanks") { 
		ref->crewNumRanks = value; 
		if (ref->crewNumRanks != "*" && ref->crewNumRanks != "") {
			vector<string> list;
			split(value, '|', list);
			for (string str : list)
				ref->crewNumRanksMap[str] = true;
		}
	}
	else if (headers[index] == "restFacility") {}
	else if (headers[index] == "rptStart") { ref->rptStart = hhmmToMinutes(value) < 0 ? 0 : hhmmToMinutes(value) * 60; } //hhmmToMinutes方法，如果value为空，则会返回-1，对后续配比搭配选择造成影响
	else if (headers[index] == "rptEnd") { ref->rptEnd = hhmmToMinutes(value) < 0 ? 0 : hhmmToMinutes(value) * 60; }//同上
	else if (headers[index] == "landingLow") { ref->landingLow = atoi(value); }
	else if (headers[index] == "landingUpper") { ref->landingUpper = atoi(value); }
	else if (headers[index] == "fdpLow") { ref->fdpLow = hhmmToMinutes(value) < 0 ? 0 : hhmmToMinutes(value) * 60; }//同上
	else if (headers[index] == "fdpUpper") { ref->fdpUpper = hhmmToMinutes(value) < 0 ? 0 : hhmmToMinutes(value) * 60; }//同上
	else if (headers[index] == "blhLow") { ref->blhLow = hhmmToMinutes(value) < 0 ? 0 : hhmmToMinutes(value) * 60; }//同上
	else if (headers[index] == "blhUpper") { ref->blhUpper = hhmmToMinutes(value) < 0 ? 0 : hhmmToMinutes(value) * 60; }//同上
	else if (headers[index] == "filiale") { ref->filiale = value; }
	else if (headers[index] == "courseTypes") { ref->courseTypeStr = value; split(value, '|', ref->courseTypes); } //ROSCRW-10363
	else if (headers[index] == "courseCodes") { ref->courseCodeStr = value; split(value, '|', ref->courseCodes); } //ROSCRW-10363
	else if (headers[index] == "courseType") {}
	else if (headers[index] == "courseCode") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else { logUnkonwnField("rank_combination_criteria", headers[index]); }
}

