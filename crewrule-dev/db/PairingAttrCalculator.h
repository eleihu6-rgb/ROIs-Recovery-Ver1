#ifndef PAIRING_ATTR_CALCULATOR_H
#define PAIRING_ATTR_CALCULATOR_H

#include <string>

#include <vector>
#include <sstream>

#include "CrewDB.h"

class PairingAttributeCalculator {
public:
	PairingAttributeCalculator(string airline, vector< SharedPtr<Segment>>& flightList, vector< SharedPtr<Route>>& routeList, map<long long, ATTRIBUTE>& attrIdMap, map<string, DBAirport*>& airportCodeMap, unordered_map<string, unordered_set<string>>& assignmentNameGroupMap,
		map<string, RANK> rankMap, vector<SharedPtr<TAG_CATEGORY>> tagCategoryList,
		map<long long, vector<SharedPtr<TAG_FLIGHT>>> tagFlightGroupMap, map<long long, vector<SharedPtr<TAG_DUTY>>> tagDutyGroupMap, map<long long, vector<SharedPtr<TAG_PAIRING>>> tagPairingGroupMap, map<long long, vector<SharedPtr<TAG_GROUP>>> tagGroupTableMap,
		map<long long, TAG *> tagGroupMap, map<long long, vector<SharedPtr<TAG_FLIGHT_COMPOSITION>>> tagFlightCompositionGroupMap);

	string calculatePairingAttr(Pairing* pg);
	string calculatePairingTag(Pairing* pg);
	string calculateDutyTag(Pairing* pg, Duty* duty);
	void calculateAndSetPairingAttr(vector<Pairing*>& pgs);
	void calculateAndSetPairingTag(vector<Pairing*>& pgs);

private:
	void appendAirportAttr(map<string, bool>& airportRouteIds, Segment* seg);
	void appendRouteAttr(stringstream& ss, map<long long, bool>& AndRouteIds, map<long long, bool>& OrRouteIds, Segment* seg);
	void appendPairingDaysAttr(stringstream& ss, Pairing* pg);
	void appendPairingFatigueAttr(stringstream& ss, Pairing* pg);
	void findRoute(vector<SharedPtr<Route>>& list, Segment* seg, map<long long, bool>& andRouteIds, map<long long, bool>& orRouteIds);

	string getAttr(Pairing* pg, string str);
	string getTagOld(Pairing* pg);
	string getTagOld(const string& tagStr, const string& expectedType);
	bool isTagCategoryType(const SharedPtr<TAG_CATEGORY>& tagCategory, const string& expectedType) const;

	bool appendTableTag(Pairing* pg, string tableCondition, long long groupId);
	bool appendTableTag(Pairing* pg, Duty* duty, string tableCondition, long long groupId);
	bool appendFlightTag(Pairing* pg, vector<SharedPtr<TAG_FLIGHT>> tagFlights, string condition);
	bool appendFlightTag(Duty* duty, vector<SharedPtr<TAG_FLIGHT>> tagFlights, string condition);
	bool appendFlightCompositionTag(Pairing* pg, vector<SharedPtr<TAG_FLIGHT_COMPOSITION>> tagFlightCompositions, string condition);
	bool appendFlightCompositionTag(Duty* duty, vector<SharedPtr<TAG_FLIGHT_COMPOSITION>> tagFlightCompositions, string condition);
	bool appendDutyTag(Pairing* pg, vector<SharedPtr<TAG_DUTY>> tagDutys, string condition);
	bool appendDutyTag(Pairing* pg, Duty* duty, vector<SharedPtr<TAG_DUTY>> tagDutys, string condition);
	bool appendPairingTag(Pairing* pg, vector<SharedPtr<TAG_PAIRING>> tagPairings, string condition);

	bool isAssignmentInGroup(string assignment, string group);

	time_t getFDPStartUtcTimes(Duty* duty, string type = "ACT", int brief = 0);
	time_t getFDPEndUtcTimes(Duty* duty, string type = "ACT");

	string airline;
	map<long long, SharedPtr<Segment>> fltIdMap;
	map<string, vector<SharedPtr<Route>>> routeFltNumMap;
	map<string, vector<SharedPtr<Route>>> routeDepMap;
	map<string, vector<SharedPtr<Route>>> routeArvMap;
	map<string, vector<ATTRIBUTE*>> attrTypeMap;
	map<long long, ATTRIBUTE> attrIdMap;
	map<string, DBAirport*> airportCodeMap;
	map<string, ATTRIBUTE> attrCodeMap;
	unordered_map<string, unordered_set<string>> assignmentNameGroupMap;
	map<string, SharedPtr<TAG_CATEGORY>> tagCodeMap;
	map<long long, SharedPtr<TAG_CATEGORY>> tagIdMap;
	map<long long, vector<SharedPtr<TAG_FLIGHT>>> tagFlightGroupMap;
	map<long long, vector<SharedPtr<TAG_FLIGHT_COMPOSITION>>> tagFlightCompositionGroupMap;
	map<long long, vector<SharedPtr<TAG_DUTY>>> tagDutyGroupMap;
	map<long long, vector<SharedPtr<TAG_PAIRING>>> tagPairingGroupMap;
	map<long long, vector<SharedPtr<TAG_GROUP>>> tagGroupTableMap;
	map<long long, TAG *> tagGroupMap;

	map<string, RANK> rankMap;
};

#endif
