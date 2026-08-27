#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void csvEvaCrDefaultDutyTimeParser::init(vector<string>& headers) {}


static vector<string> csvEvaCrDefaultDutyTimeDefaultHeaders = { "id", "ddtAssignmentUnitQualifier", "ddtAssignmentUnitType", "ddtBaseAirportCode", "ddtDefaultDurationMins", "ddtDefaultLocalStrTime", "defaultLocalStrDt", "defaultLocalEndDt", "ddtRestTime" };
vector<string>& csvEvaCrDefaultDutyTimeParser::getDefaultHeaders() {
	return csvEvaCrDefaultDutyTimeDefaultHeaders;
}

void* csvEvaCrDefaultDutyTimeParser::createInstance() {
	return new CsvEvaCrDefaultDutyTime();
}

void csvEvaCrDefaultDutyTimeParser::deleteInstance(void* obj) {
	delete (CsvEvaCrDefaultDutyTime*)obj;
}

string csvEvaCrDefaultDutyTimeParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	CsvEvaCrDefaultDutyTime * ref = (CsvEvaCrDefaultDutyTime *)obj;
	//"id","ddtAssignmentUnitQualifier","ddtAssignmentUnitType","ddtBaseAirportCode","ddtDefaultDurationMins","ddtDefaultLocalStrTime","defaultLocalStrDt","defaultLocalEndDt","ddtRestTime"
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "ddtAssignmentUnitQualifier") { ss << ref->ddtAssignmentUnitQualifier << "^"; }
		else if (headers[i] == "ddtAssignmentUnitType") { ss << ref->ddtAssignmentUnitType << "^"; }
		else if (headers[i] == "ddtBaseAirportCode") { ss << ref->ddtBaseAirportCode << "^"; }
		else if (headers[i] == "ddtDefaultDurationMins") { ss << ref->ddtDefaultDurationMins << "^"; }
		else if (headers[i] == "ddtDefaultLocalStrTime") { ss << ref->ddtDefaultLocalStrTime << "^"; }
		else if (headers[i] == "defaultLocalStrDt") { ss << utcToUtcString(ref->defaultLocalStrDt) << "^"; }
		else if (headers[i] == "defaultLocalEndDt") { ss << utcToUtcString(ref->defaultLocalEndDt) << "^"; }
		else if (headers[i] == "ddtRestTime") { ss << ref->ddtRestTime << "^"; }
		else { logUnkonwnField("eva_cr_default_duty_time", headers[i]); }
	}
	return ss.str();
}

void csvEvaCrDefaultDutyTimeParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CsvEvaCrDefaultDutyTime * ref = (CsvEvaCrDefaultDutyTime *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "ddtAssignmentUnitQualifier") { ref->ddtAssignmentUnitQualifier = value; }
	else if (headers[index] == "ddtAssignmentUnitType") { ref->ddtAssignmentUnitType = value; }
	else if (headers[index] == "ddtBaseAirportCode") { ref->ddtBaseAirportCode =  value; }
	else if (headers[index] == "ddtDefaultDurationMins") { ref->ddtDefaultDurationMins = atoi(value); }
	else if (headers[index] == "ddtDefaultLocalStrTime") { ref->ddtDefaultLocalStrTime = value; }
	else if (headers[index] == "defaultLocalStrDt") { ref->defaultLocalStrDt = utcStrToUtc(value); }
	else if (headers[index] == "defaultLocalEndDt") { ref->defaultLocalEndDt = utcStrToUtc(value); }
	else if (headers[index] == "ddtRestTime") { ref->ddtRestTime = atoi(value); }
	else { logUnkonwnField("eva_cr_default_duty_time", headers[index]); }
}

