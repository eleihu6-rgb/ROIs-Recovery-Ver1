#pragma once

#include <string.h>

#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"
//aircraftParser

void tagFlightParser::init(vector<string>& headers) {}


static vector<string> tagFlightDefaultHeaders = { "tagGroupId", "fltDtStart", "fltDtEnd", "fltNum", "fleet", "dir",
"depArp","arvArp","stdStart","stdEnd","staStart","staEnd","createdBy","createdDt","lastModified", "modifiedBy","id" };
vector<string>& tagFlightParser::getDefaultHeaders() {
	return tagFlightDefaultHeaders;
}

void* tagFlightParser::createInstance() {
	return new TAG_FLIGHT();
}

void tagFlightParser::deleteInstance(void* obj) {
	delete (TAG_FLIGHT*)obj;
}


string tagFlightParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TAG_FLIGHT * ref = (TAG_FLIGHT *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "tagGroupId") { ss << ref->tagGroupId << "^"; }
		else if (headers[i] == "fltDtStart") { ss << ref->fltDtStart << "^"; }
		else if (headers[i] == "fltDtEnd") { ss << ref->fltDtEnd << "^"; }
		else if (headers[i] == "fltNum") { ss << joinStrList(ref->fltNum, "|") << "^"; }
		else if (headers[i] == "fleet") { ss << joinStrList(ref->fleet, "|") << "^"; }
		else if (headers[i] == "dir") { ss << joinStrList(ref->dir, "|") << "^"; }
		else if (headers[i] == "depArp") { ss << ref->depArp << "^"; }
		else if (headers[i] == "arvArp") { ss << ref->arvArp << "^"; }
		else if (headers[i] == "stdStart") { ss << ref->stdStart << "^"; }
		else if (headers[i] == "stdEnd") { ss << ref->stdEnd << "^"; }
		else if (headers[i] == "staStart") { ss << ref->staStart << "^"; }
		else if (headers[i] == "staEnd") { ss << ref->staEnd << "^"; }
		else if (headers[i] == "createdBy") { ss << "^"; }
		else if (headers[i] == "createdDt") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "id") { ss << "^"; }
		else { logUnkonwnField("tagFlight", headers[i]); }
	}
	return ss.str();

}


void tagFlightParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TAG_FLIGHT * ref = (TAG_FLIGHT *)obj;
	if (headers[index] == "tagGroupId") { ref->tagGroupId = atoll(value); }
	else if (headers[index] == "fltDtStart") { ref->fltDtStart = utcStrToUtc(value); }
	else if (headers[index] == "fltDtEnd") { ref->fltDtEnd = utcStrToUtc(value); }
	else if (headers[index] == "fltNum") { split(value, '|', ref->fltNum); }
	else if (headers[index] == "fleet") { split(value, '|', ref->fleet); }
	else if (headers[index] == "subFleets") { split(value, '|', ref->subFleets); }
	else if (headers[index] == "depArp") { ref->depArp = value; }
	else if (headers[index] == "arvArp") { ref->arvArp = value; }
	else if (headers[index] == "stdStart") { ref->stdStart = value; }
	else if (headers[index] == "stdEnd") { ref->stdEnd = value; }
	else if (headers[index] == "staStart") { ref->staStart = value; }
	else if (headers[index] == "staEnd") { ref->staEnd = value; }
	else if (headers[index] == "dir") { split(value, '|', ref->dir); }
	else if (headers[index] == "assignments") { split(value, '|', ref->assignments); }
	else if (headers[index] == "schBlhStart") { ref->scheduleBLHStart = value; }
	else if (headers[index] == "schBlhEnd") { ref->scheduleBLHEnd = value; }
	else if (headers[index] == "actBlhStart") { ref->actBLHStart = value; }
	else if (headers[index] == "actBlhEnd") { ref->actBLHEnd = value; }
	else if (headers[index] == "flightType") { split(value, '|', ref->fltType); }
	else if (headers[index] == "country") { ref->country = value; }
	else if (headers[index] == "depArpCategory") { ref->depArpCategory = value; }
	else if (headers[index] == "arvArpCategory") { ref->arvArpCategory = value; }
	else if (headers[index] == "airportCategory") { ref->airportCategory = value; }
	else if (headers[index] == "createdBy") {}
	else if (headers[index] == "createdDt") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "id") {}
	else { logUnkonwnField("tagFlight", headers[index]); }

}