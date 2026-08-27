#include <sstream>
#include "UtilFunc.h"
#include "csv_impl.h"

void commuteScheduleParser::init(vector<string>& headers) {}


string commuteScheduleParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	csvCommuteSchedule * ref = (csvCommuteSchedule *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << ","; }
		else if (headers[i] == "worksetId") { ss << ref->worksetId << ","; }
		else if (headers[i] == "airline") { ss << ref->airline << ","; }
		else if (headers[i] == "effDt") { ss << utcToUtcTzString(ref->effDt) << ","; }
		else if (headers[i] == "expDt") { ss << utcToUtcTzString(ref->expDt) << ","; }
		else if (headers[i] == "dow") { ss << ref->dow << ","; }
		else if (headers[i] == "commuteType") { ss << ref->commuteType << ","; }
		else if (headers[i] == "commuteNum") { ss << ref->commuteNum << ","; }
		else if (headers[i] == "depSta") { ss << ref->depSta << ","; }
		else if (headers[i] == "depTm") { ss << ref->depTm << ","; }
		else if (headers[i] == "arvSta") { ss << ref->arvSta << ","; }
		else if (headers[i] == "arvTm") { ss << ref->arvTm << ","; }
		else if (headers[i] == "durationMin") { ss << ref->durationMin << ","; }
		else if (headers[i] == "flightFlag") { ss << ref->flightFlag << ","; }
		else if (headers[i] == "flightAssignment") { ss << ref->flightAssignment << ","; }
		else if (headers[i] == "fleet") { ss << ref->fleet << ","; }
		else if (headers[i] == "status") { ss << ref->status << ","; }
		else { logUnkonwnField("commute_schedule", headers[i]); }
	}
	return ss.str();
}

void commuteScheduleParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	csvCommuteSchedule * ref = (csvCommuteSchedule *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "worksetId") { if (ref->worksetId == NULL) ref->worksetId = atoll(value); }
	else if (headers[index] == "airline") { if (ref->airline == "") ref->airline = value; }
	else if (headers[index] == "effDt") { ref->effDt = utcStrToUtc(value); }
	else if (headers[index] == "expDt") { ref->expDt = utcStrToUtc(value); }
	else if (headers[index] == "dow") { ref->dow = value; }
	else if (headers[index] == "commuteType") { ref->commuteType = value; }
	else if (headers[index] == "commuteNum") { ref->commuteNum = value; }
	else if (headers[index] == "depSta") { ref->depSta = value; }
	else if (headers[index] == "depTm") { ref->depTm = atoi(value); }
	else if (headers[index] == "arvSta") { ref->arvSta = value; }
	else if (headers[index] == "arvTm") { ref->arvTm = atoi(value); }
	else if (headers[index] == "durationMin") { ref->durationMin = atoi(value); }
	else if (headers[index] == "flightFlag") { ref->flightFlag = value; }
	else if (headers[index] == "flightAssignment") { ref->flightAssignment = value; }
	else if (headers[index] == "fleet") { ref->fleet = value; }
	else if (headers[index] == "status") { ref->status = value; }
	else if (headers[index] == "schId") { if (ref->worksetId == NULL) ref->worksetId = atoll(value); }
	else if (headers[index] == "filiale") { if (ref->airline == "") ref->airline = value; }
	else if (headers[index] == "division") { ref->division = value; }
	else if (headers[index] == "price") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else { logUnkonwnField("commute_schedule", headers[index]); }

}

void* commuteScheduleParser::createInstance() {
	return new csvCommuteSchedule();
}

void commuteScheduleParser::deleteInstance(void* obj) {
	delete (csvCommuteSchedule*)obj;
}

static vector<string> commuteScheduleDefaultHeaders = { "id", "worksetId", "airline", "effDt", "expDt", "dow", "commuteType", "commuteNum", "depSta", "depTm", "arvSta", "arvTm", "durationMin" };
vector<string>& commuteScheduleParser::getDefaultHeaders() {
	return commuteScheduleDefaultHeaders;
}