#include <sstream>
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void briefingParser::init(vector<string>& headers) {}


static vector<string> briefingDefaultHeaders = { };
vector<string>& briefingParser::getDefaultHeaders() {
	return briefingDefaultHeaders;
}

void* briefingParser::createInstance() {
	return new Briefing();
}

void briefingParser::deleteInstance(void* obj) {
	delete (Briefing*)obj;
}

string briefingParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	Briefing * ref = (Briefing *)obj;
	//"id", "briefing", "briefingName", "briefingNativeName", "briefing4code", "briefingAbbr", "city", "cityName", "cityNativeName", "category", "dir", "zoneId"
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "airline") { ss << ref->airline << "^"; }
		else if (headers[i] == "airport") { ss << ref->airport << "^"; }
		else if (headers[i] == "dir") { ss << ref->dir << "^"; }
		else if (headers[i] == "strTm") { ss << ref->strTm << "^"; }
		else if (headers[i] == "endTm") { ss << ref->endTm << "^"; }
		else if (headers[i] == "flyBrief") { ss << ref->flyBrief << "^"; }
		else if (headers[i] == "flyDebrief") { ss << ref->flyDebrief << "^"; }
		else if (headers[i] == "dhdBrief") { ss << ref->dhdBrief << "^"; }
		else if (headers[i] == "dhdDebrief") { ss << ref->dhdDebrief << "^"; }
		else if (headers[i] == "trainBrief") { ss << ref->trainBrief << "^"; }
		else if (headers[i] == "trainDebrief") { ss << ref->trainDebrief << "^"; }
		else if (headers[i] == "busBrief") { ss << ref->busBrief << "^"; }
		else if (headers[i] == "busDebrief") { ss << ref->busDebrief << "^"; }
		else if (headers[i] == "otherBrief") { ss << ref->otherBrief << "^"; }
		else if (headers[i] == "otherDebrief") { ss << ref->otherDebrief << "^"; }
		else if (headers[i] == "pickup") { ss << ref->pickup << "^"; }
		else if (headers[i] == "dropoff") { ss << ref->dropoff << "^"; }
		else { logUnkonwnField("briefing", headers[i]); }
	}
	return ss.str();
}

void briefingParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	Briefing * ref = (Briefing *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "airline") { ref->airline = value; }
	else if (headers[index] == "airport") { ref->airport = value; }
	else if (headers[index] == "dir") { ref->dir = value; }
	else if (headers[index] == "strTm") { ref->strTm = atoi(value); }
	else if (headers[index] == "endTm") { ref->endTm = atoi(value); }
	else if (headers[index] == "flyBrief") { ref->flyBrief = atoi(value); }
	else if (headers[index] == "flyDebrief") { ref->flyDebrief = atoi(value); }
	else if (headers[index] == "dhdBrief") { ref->dhdBrief = atoi(value); }
	else if (headers[index] == "dhdDebrief") { ref->dhdDebrief = atoi(value); }
	else if (headers[index] == "trainBrief") { ref->trainBrief = atoi(value); }
	else if (headers[index] == "trainDebrief") { ref->trainDebrief = atoi(value); }
	else if (headers[index] == "busBrief") { ref->busBrief = atoi(value); }
	else if (headers[index] == "busDebrief") { ref->busDebrief = atoi(value); }
	else if (headers[index] == "otherBrief") { ref->otherBrief = atoi(value); }
	else if (headers[index] == "otherDebrief") { ref->otherDebrief = atoi(value); }
	else if (headers[index] == "pickup") { ref->pickup = atoi(value); }
	else if (headers[index] == "dropoff") { ref->dropoff = atoi(value); }
	else { logUnkonwnField("briefing", headers[index]); }
}

