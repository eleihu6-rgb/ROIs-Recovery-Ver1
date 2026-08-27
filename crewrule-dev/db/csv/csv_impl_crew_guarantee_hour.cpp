#include <sstream>
#include <string.h>
#include "../CrewDB.h"
#include "UtilFunc.h"
#include "csv_impl.h"

void crewGuaranteeHourParser::init(vector<string>& headers) {}


string crewGuaranteeHourParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	CREW_GUARANTEE_HOUR * ref = (CREW_GUARANTEE_HOUR*)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "crewId") { ss << ref->idCrew << "^"; }
		else if (headers[i] == "effDt") { ss << utcToUtcTzString(ref->effDt) << "^"; }
		else if (headers[i] == "expDt") { ss << utcToUtcTzString(ref->expDt) << "^"; }
		else if (headers[i] == "guaranteeHour") { ss << ref->guaranteeHour << "^"; } //单位：分钟
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("crewGuaranteeHour", headers[i]); }
	}
	return ss.str();
}

void crewGuaranteeHourParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CREW_GUARANTEE_HOUR * ref = (CREW_GUARANTEE_HOUR *)obj;
	if (headers[index] == "id") {}
	else if (headers[index] == "crewId") { ref->idCrew = value; }
	else if (headers[index] == "effDt") { ref->effDt = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "expDt") { ref->expDt = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "guaranteeHour") { ref->guaranteeHour = atoi(value); } //单位：分钟
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else { logUnkonwnField("crewGuaranteeHour", headers[index]); }
}

void* crewGuaranteeHourParser::createInstance() {
	return new CREW_GUARANTEE_HOUR();
}

void crewGuaranteeHourParser::deleteInstance(void* obj) {
	delete (CREW_GUARANTEE_HOUR*)obj;
}

static vector<string> crewGuaranteeHourDefaultHeaders = { "id","crewId","effDt","expDt","guaranteeHour","modifiedBy","lastModified" };
vector<string>& crewGuaranteeHourParser::getDefaultHeaders() {
	return crewGuaranteeHourDefaultHeaders;
}