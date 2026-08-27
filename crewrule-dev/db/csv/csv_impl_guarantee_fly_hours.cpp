#include <sstream>
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void guaranteeFlyHoursParser::init(vector<string>& headers) {}


static vector<string> guaranteeFlyHoursDefaultHeaders = { "id", "base", "rank", "fleet", "team", "guaranteeFlyingHours", "effDt", "frequency", "expDt", "modifiedBy", "lastModified" };
vector<string>& guaranteeFlyHoursParser::getDefaultHeaders() {
	return guaranteeFlyHoursDefaultHeaders;
}

void* guaranteeFlyHoursParser::createInstance() {
	return new GuaranteeFlyHours();
}

void guaranteeFlyHoursParser::deleteInstance(void* obj) {
	delete (GuaranteeFlyHours*)obj;
}

string guaranteeFlyHoursParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	GuaranteeFlyHours * ref = (GuaranteeFlyHours *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "base") { ss << ref->base << "^"; }
		else if (headers[i] == "rank") { ss << ref->rank << "^"; }
		else if (headers[i] == "fleet") { ss << ref->fleet << "^"; }
		else if (headers[i] == "team") { ss << ref->team << "^"; }
		else if (headers[i] == "guaranteeFlyingHours") { ss << ref->guaranteeFlyingHour << "^"; }
		else if (headers[i] == "effDt") { ss << utcToUtcTzString(ref->effDt) << "^"; }
		else if (headers[i] == "frequency") { ss << ref->frequency << "^"; }
		else if (headers[i] == "expDt") { ss << utcToUtcTzString(ref->expDt) << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("guarantee_fly_hours", headers[i]); }
	}
	return ss.str();
}

void guaranteeFlyHoursParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	GuaranteeFlyHours * ref = (GuaranteeFlyHours *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "base") { 
		ref->base = value; 
		split(value, '|', ref->bases);
	}
	else if (headers[index] == "rank") { 
		ref->rank = value; 
		split(value, '|', ref->ranks);
	}
	else if (headers[index] == "fleet") { 
		ref->fleet = value; 
		split(value, '|', ref->fleets);
	}
	else if (headers[index] == "team") { 
		ref->team = value;
		if (ref->team != "*") {
			ref->teams.clear();
			vector<string> tmpTeams;
			split(value, '|', tmpTeams);
			for (auto& tmpTeam : tmpTeams) {
				ref->teams.push_back(atoll(tmpTeam.c_str()));
			}
		}
	}
	else if (headers[index] == "guaranteeFlyingHours") { ref->guaranteeFlyingHour = atoi(value); }
	else if (headers[index] == "effDt") { ref->effDt = (value == nullptr || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "frequency") { ref->frequency = value; }
	else if (headers[index] == "expDt") { ref->expDt = (value == nullptr || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "approvedLeaveDays") {}
	else if (headers[index] == "rdo") {}
	else if (headers[index] == "grey") {}
	else if (headers[index] == "configPriority") {}
	else if (headers[index] == "guaranteeWorkingDays") {}
	else if (headers[index] == "remark") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else { logUnkonwnField("guarantee_fly_hours", headers[index]); }
}

