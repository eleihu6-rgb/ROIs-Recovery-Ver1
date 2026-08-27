#include <sstream>
#include <string.h>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void crewKpiAdjustParser::init(vector<string>& headers) {}


//id,crewId,pairingId,segmentId,rosterId,rosterFlightId,fltId,type,adjustDate,adjustment,comments,createdBy,createdDt,modifiedBy,lastModified
static vector<string> crewKpiAdjustDefaultHeaders = { "id","crewId","pairingId","segmentId","rosterId","rosterFlightId","fltId","type","adjustDate","adjustment" };
vector<string>& crewKpiAdjustParser::getDefaultHeaders() {
	return crewKpiAdjustDefaultHeaders;
}

void* crewKpiAdjustParser::createInstance() {
	return new CrewKpiAdjust();
}

void crewKpiAdjustParser::deleteInstance(void* obj) {
	delete (CrewKpiAdjust*)obj;
}

string crewKpiAdjustParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	CrewKpiAdjust * ref = (CrewKpiAdjust *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "crewId") { ss << ref->idCrew << "^"; }
		else if (headers[i] == "rosterFlightId") { ss << ref->rosterFlightId << "^"; }
		else if (headers[i] == "fltId") { ss << ref->fltId << "^"; }
		else if (headers[i] == "type") { ss << ref->type << "^"; }
		else if (headers[i] == "adjustDate") { ss << utcToUtcTzString(ref->adjustDate) << "^"; }
		else if (headers[i] == "adjustment") { ss << ref->adjustment << "^"; }
		else if (headers[i] == "comments") { ss << "^"; }
		else if (headers[i] == "createdBy") { ss << "^"; }
		else if (headers[i] == "createdDt") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		//else { logUnkonwnField("CrewKpiAdjust", headers[i]); }
	}
	return ss.str();
}

void crewKpiAdjustParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CrewKpiAdjust * ref = (CrewKpiAdjust *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "crewId") { ref->idCrew = value; }
	else if (headers[index] == "rosterFlightId") { ref->rosterFlightId = atoll(value); }
	else if (headers[index] == "fltId") { ref->fltId = atoll(value); }
	else if (headers[index] == "type") { ref->type = atoi(value); }
	else if (headers[index] == "adjustDate") { ref->adjustDate = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "adjustment") { ref->adjustment = atoi(value); }
	else if (headers[index] == "comments") {}
	else if (headers[index] == "createdBy") {}
	else if (headers[index] == "createdDt") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else { logUnkonwnField("CrewKpiAdjust", headers[index]); }
}

