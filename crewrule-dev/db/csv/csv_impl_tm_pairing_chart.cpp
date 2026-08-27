#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmPairingChartParser::init(vector<string>& headers) {}


static vector<string> tmPairingChartDefaultHeaders = { "id","buddyNumber","effDt","expDt","rankMatch","duration","modifiedBy","lastModified" };
vector<string>& tmPairingChartParser::getDefaultHeaders() {
	return tmPairingChartDefaultHeaders;
}

void* tmPairingChartParser::createInstance() {
	return new TmPairingChart();
}

void tmPairingChartParser::deleteInstance(void* obj) {
	delete (TmPairingChart*)obj;
}

string tmPairingChartParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmPairingChart * ref = (TmPairingChart *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "buddyNumber") { ss << ref->buddyNumber << "^"; }
		else if (headers[i] == "effDt") { ss << utcToUtcTzString(ref->effDt) << "^"; }
		else if (headers[i] == "expDt") { ss << utcToUtcTzString(ref->expDt) << "^"; }
		else if (headers[i] == "rankMatch") { ss << ref->rankMatch << "^"; }
		else if (headers[i] == "duration") { ss << ref->duration << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmPairingChart", headers[i]); }
	}
	return ss.str();
}

void tmPairingChartParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmPairingChart * ref = (TmPairingChart *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "buddyNumber") { ref->buddyNumber = atoi(value); }
	else if (headers[index] == "effDt") { ref->effDt = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "expDt") { ref->expDt = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "rankMatch") { 
		ref->rankMatch = value;
		vector<string> crewRanks;
		if (!ref->rankMatch.empty() && ref->rankMatch != "*") {
			split(ref->rankMatch, ',', crewRanks);
		}
		for (size_t i = 0; i < crewRanks.size(); i++) {
			if (i == 0) {
				auto& teRank = crewRanks.at(i);
				if (!teRank.empty() && teRank != "ALL" && teRank != "*") {
					split(teRank, '|', ref->teRanks);
				}
			}
			else {
				vector<string> buddyRanks;
				auto& buddyRank = crewRanks.at(i);
				if (buddyRank.empty()) {
					continue;
				}
				if (!buddyRank.empty() && buddyRank != "ALL" && buddyRank != "*") {
					split(buddyRank, '|', buddyRanks);
				}
				ref->allBuddyRanks.emplace_back(buddyRanks);
			}
		}
	}
	else if (headers[index] == "duration") { 
		ref->duration = atof(value); 
		ref->durationMinutes = static_cast<int>(ref->duration * 60);//小时转换成分钟数
	}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "courseIds") {}
	else { logUnkonwnField("tmPairingChart", headers[index]); }
}

