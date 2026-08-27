#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void rankValueParser::init(vector<string>& headers) {}


static vector<string> rankValueDefaultHeaders = { "activityId", "rank", "value" };
vector<string>& rankValueParser::getDefaultHeaders() {
	return rankValueDefaultHeaders;
}

void* rankValueParser::createInstance() {
	return new csvRankValue();
}

void rankValueParser::deleteInstance(void* obj) {
	delete (csvRankValue*)obj;
}

string rankValueParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	csvRankValue * ref = (csvRankValue *)obj;
	//"id", "rankValue", "rankValueName", "rankValueNativeName", "rankValue4code", "rankValueAbbr", "city", "cityName", "cityNativeName", "category", "dir", "zoneId"
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "activityId") { ss << ref->activityId << "^"; }
		else if (headers[i] == "rank") { ss << ref->rank << "^"; }
		else if (headers[i] == "value") { ss << ref->value << "^"; }
		else { logUnkonwnField("rank_value", headers[i]); }
	}
	return ss.str();
}

void rankValueParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	csvRankValue * ref = (csvRankValue *)obj;
	if (headers[index] == "activityId") { ref->activityId = atoll(value); }
	else if (headers[index] == "rank") { ref->rank = value; }
	else if (headers[index] == "value") { ref->value = atoi(value); }
	else { logUnkonwnField("rank_value", headers[index]); }
}

