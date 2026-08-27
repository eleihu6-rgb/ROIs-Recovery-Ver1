#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmFootprintParser::init(vector<string>& headers) {}


static vector<string> tmFootprintDefaultHeaders = { "id", "name", "level", "parentId", "footprintDesc", "footprintVer", "recurrentFlag", "footprintQual", "allQual", "division", "crewBase", "crewRank", "crewFleet", "crewTeam", "effDate", "expDate", "status", "createTime", "modifiedBy", "lastModified", "courseSequence", "footprintType", "footprintSubType", "footprintLevel" };
vector<string>& tmFootprintParser::getDefaultHeaders() {
	return tmFootprintDefaultHeaders;
}

void* tmFootprintParser::createInstance() {
	return new TmFootprint();
}

void tmFootprintParser::deleteInstance(void* obj) {
	delete (TmFootprint*)obj;
}

string tmFootprintParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmFootprint * ref = (TmFootprint *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "name") { ss << "^"; }
		else if (headers[i] == "level") { ss << ref->level << "^"; }
		else if (headers[i] == "parentId") { ss << ref->parentId << "^"; }
		else if (headers[i] == "footprintDesc") { ss << "^"; }
		else if (headers[i] == "footprintVer") { ss << ref->footprintVer << "^"; }
		else if (headers[i] == "recurrentFlag") { ss << ref->recurrentFlag << "^"; }
		else if (headers[i] == "footprintQual") { ss << ref->footprintQual << "^"; }
		else if (headers[i] == "allQual") { ss << ref->allQual << "^"; }
		else if (headers[i] == "division") { ss << ref->division << "^"; }
		else if (headers[i] == "crewBase") { ss << ref->crewBase << "^"; }
		else if (headers[i] == "crewRank") { ss << ref->crewRank << "^"; }
		else if (headers[i] == "crewFleet") { ss << ref->crewFleet << "^"; }
		else if (headers[i] == "crewTeam") { ss << ref->crewTeam << "^"; }
		else if (headers[i] == "effDate") { ss << utcToUtcTzString(ref->effDate) << "^"; }
		else if (headers[i] == "expDate") { ss << utcToUtcTzString(ref->expDate) << "^"; }
		else if (headers[i] == "status") { ss << ref->status << "^"; }
		else if (headers[i] == "courseSequence") { ss << ref->courseSequence << "^"; }
		else if (headers[i] == "footprintType") { ss << ref->footprintType << "^"; }
		else if (headers[i] == "footprintSubType") { ss << ref->footprintSubType << "^"; }
		else if (headers[i] == "footprintLevel") { ss << ref->footprintLevel << "^"; }
		else if (headers[i] == "createTime") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmFootprint", headers[i]); }
	}
	return ss.str();
}

void tmFootprintParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmFootprint * ref = (TmFootprint *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "name") { ref->name = value; }
	else if (headers[index] == "level") { ref->level = atoi(value); }
	else if (headers[index] == "parentId") { ref->parentId = atoll(value); }
	else if (headers[index] == "footprintDesc") {  }
	else if (headers[index] == "footprintVer") { ref->footprintVer = value; }
	else if (headers[index] == "recurrentFlag") { ref->recurrentFlag = atoi(value); }
	else if (headers[index] == "footprintQual") { 
		ref->footprintQual = value; 
		if (!ref->footprintQual.empty() && ref->footprintQual != "ALL" && ref->footprintQual != "*") {
			split(ref->footprintQual, '|', ref->footprintQuals);
			for (auto& qual : ref->footprintQuals) {
				if (qual.length() > 2) {
					//移除后缀_P
					qual.erase(qual.length() - 2, 2);
				}
			}
		}
	}
	else if (headers[index] == "allQual") { 
		ref->allQual = value; 
		if (!ref->allQual.empty() && ref->allQual != "ALL" && ref->allQual != "*") {
			split(ref->allQual, '|', ref->allQuals);
			for (auto& qual : ref->allQuals) {
				if (qual.length() > 2) {
					//移除后缀_P
					qual.erase(qual.length() - 2, 2);
				}
			}
		}
	}
	else if (headers[index] == "division") { ref->division = value; }
	else if (headers[index] == "crewBase") { 
		ref->crewBase = value; 
		if (!ref->crewBase.empty() && ref->crewBase != "ALL" && ref->crewBase != "*") {
			split(ref->crewBase, '|', ref->crewBases);
		}
	}
	else if (headers[index] == "crewRank") { 
		ref->crewRank = value; 
		if (!ref->crewRank.empty() && ref->crewRank != "ALL" && ref->crewRank != "*") {
			split(ref->crewRank, '|', ref->crewRanks);
		}
	}
	else if (headers[index] == "crewFleet") { 
		ref->crewFleet = value; 
		if (!ref->crewFleet.empty() && ref->crewFleet != "ALL" && ref->crewFleet != "*") {
			split(ref->crewFleet, '|', ref->crewFleets);
		}
	}
	else if (headers[index] == "crewTeam") { 
		ref->crewTeam = value; 
		if (!ref->crewTeam.empty() && ref->crewTeam != "ALL" && ref->crewTeam != "*") {
			split(ref->crewTeam, '|', ref->crewTeams);
		}
	}
	else if (headers[index] == "effDate") { ref->effDate = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "expDate") { ref->expDate = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "status") { ref->status = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "courseSequence") { ref->courseSequence = atoi(value); }
	else if (headers[index] == "footprintType") { ref->footprintType = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "footprintSubType") { ref->footprintSubType = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "footprintLevel") { ref->footprintLevel = atoi(value); }
	else if (headers[index] == "memo") {}
	else if (headers[index] == "createTime") {  }
	else if (headers[index] == "modifiedBy") {  }
	else if (headers[index] == "lastModified") {  }
	else if (headers[index] == "externalFootprintId") {  }
	else { logUnkonwnField("tmFootprint", headers[index]); }
}

