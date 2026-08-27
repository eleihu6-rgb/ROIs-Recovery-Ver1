#ifndef _SEGMENT_JSON_H_
#define _SEGMENT_JSON_H_
#include <string>
#include <vector>
#include <map>
#include "rapidjson/document.h"		// rapidjson's DOM-style API
#include "rapidjson/prettywriter.h"	// for stringify JSON
#include "rapidjson/filestream.h"	// wrapper of C stream for prettywriter as output
#include "rapidjson/stringbuffer.h"	// wrapper of C stream for prettywriter as output
#include "UtilFunc.h"
#include "JsonUtil.h"
#include "../Segment.h"

using namespace std;
using namespace rapidjson;

class SegmentJson : public JsonParserItem {
private:
	vector<char*> fieldNames;
public:
	SegmentJson() { vector<char*> list = { "id", "dbid", "originalId", "airlineCD", "soflSeqNr1", "segNumber", "domIntType", "schId", "fleetCD", "blkTime", "depStation", "arrStation", "startTime", "endTime", "startTimeLocal", "endTimeLocal", "nextLegNo", "relArcDy", "date", "depMinutesFromDayBegin", "dayInt", "openComposition", "planComposition", "fillComposition", "compositionId", "compositionHierarchy", "turnTime", "tail", "isMustStartDuty", "isMustEndDuty", "isStratigicLeg", "isVIPLeg", "base", "isOperating", "isDeadhead", "isCountForCoverage", "originalSeg", "isCovered", "expatAllow", "expatMust", "ICAO", "specialAirport", "isBusFerry", "is1A", "is1B", "is2A", "is2B", "tailNum", "pairingNum", "crewLinkNum", "assignment", "isDhdPicked", "blkMinHistory", "numInDuty", "utcStartTime", "utcEndTime" }; fieldNames = list; }

	void* createNew() { return (void*) new Segment(); }

	vector<char*> getFieldNames() { return fieldNames; }

	void getField(const char* fieldName, void * o, Document::AllocatorType& alloc, Value& outV) {
		Segment * obj = (Segment*)o;
		if (0 == strcmp(fieldName, "id"))                      { outV.AddMember("id", obj->getId(), alloc); }
		if (0 == strcmp(fieldName, "dbid"))                    { outV.AddMember("dbid", obj->getDBId(), alloc); }
		//if (0 == strcmp(fieldName, "originalId"))              { outV.AddMember("originalId", obj->getori(), alloc); }
		if (0 == strcmp(fieldName, "segNumber"))               { Value v(obj->getSegNumber().c_str(), alloc); outV.AddMember("segNumber", v, alloc); }
		if (0 == strcmp(fieldName, "domIntType"))              { Value v(obj->getDomIntType().c_str(), alloc); outV.AddMember("domIntType", v, alloc); }
		//if (0 == strcmp(fieldName, "schId"))                   { Value v(obj->get().c_str(), alloc); outV.AddMember("schId", v, alloc); }
		if (0 == strcmp(fieldName, "fleetCD"))                 { Value v(obj->getFleetCD().c_str(), alloc); outV.AddMember("fleetCD", v, alloc); }
		if (0 == strcmp(fieldName, "blkTime"))                 { outV.AddMember("blkTime", (long long)obj->getBlkTime(), alloc); }
		if (0 == strcmp(fieldName, "depStation"))              { Value v(obj->getDepStation().c_str(), alloc); outV.AddMember("depStation", v, alloc); }
		if (0 == strcmp(fieldName, "arrStation"))              { Value v(obj->getArrStation().c_str(), alloc); outV.AddMember("arrStation", v, alloc); }
		if (0 == strcmp(fieldName, "startTime"))               { char str[20] = { 0 }; utcToUtcStr(obj->getStartTimeLocSch(), str, sizeof(str));  Value v(str, alloc); outV.AddMember("startTime", v, alloc); }
		if (0 == strcmp(fieldName, "endTime"))                 { char str[20] = { 0 }; utcToUtcStr(obj->getEndTimeLocSch(), str, sizeof(str));  Value v(str, alloc); outV.AddMember("endTime", v, alloc); }
		if (0 == strcmp(fieldName, "startTimeLocal"))          { char str[20] = { 0 }; utcToUtcStr(obj->getStartTimeLocSch(), str, sizeof(str));  Value v(str, alloc); outV.AddMember("startTimeLocal", v, alloc); }
		if (0 == strcmp(fieldName, "endTimeLocal"))            { char str[20] = { 0 }; utcToUtcStr(obj->getEndTimeLocSch(), str, sizeof(str));  Value v(str, alloc); outV.AddMember("endTimeLocal", v, alloc); }
		if (0 == strcmp(fieldName, "nextLegNo"))               { Value v(obj->getNextLegNo().c_str(), alloc); outV.AddMember("nextLegNo", v, alloc); }
		if (0 == strcmp(fieldName, "relArcDy"))                { outV.AddMember("relArcDy", obj->getRelArcDy(), alloc); }
		if (0 == strcmp(fieldName, "openComposition"))         { Value v(kObjectType); map<string, int> m = obj->getOpenComposition(); for (map<string, int>::iterator it = m.begin(); it != m.end(); it++) { addIntField(v, it->first.c_str(), it->second, alloc); } outV.AddMember("openComposition", v, alloc); }
		if (0 == strcmp(fieldName, "planComposition"))         { Value v(kObjectType); map<string, int> m = obj->getPlanComposition(); for (map<string, int>::iterator it = m.begin(); it != m.end(); it++) { addIntField(v, it->first.c_str(), it->second, alloc); } outV.AddMember("planComposition", v, alloc); }
		if (0 == strcmp(fieldName, "fillComposition"))         { Value v(kObjectType); map<string, int> m = obj->getFillComposition(); for (map<string, int>::iterator it = m.begin(); it != m.end(); it++) { addIntField(v, it->first.c_str(), it->second, alloc); } outV.AddMember("fillComposition", v, alloc); }
		if (0 == strcmp(fieldName, "compositionId"))           { outV.AddMember("compositionId", obj->getCompositionId(), alloc); }
		if (0 == strcmp(fieldName, "compositionHierarchy"))    { outV.AddMember("compositionHierarchy", obj->getCompositionHierarchy(), alloc); }
		if (0 == strcmp(fieldName, "turnTime"))                { outV.AddMember("turnTime", (long long)obj->getTurnTime(), alloc); }
		if (0 == strcmp(fieldName, "isMustStartDuty"))         { outV.AddMember("isMustStartDuty", obj->getIsMustStartDuty(), alloc); }
		if (0 == strcmp(fieldName, "isMustEndDuty"))           { outV.AddMember("isMustEndDuty", obj->getIsMustEndDuty(), alloc); }
		if (0 == strcmp(fieldName, "isStratigicLeg"))          { outV.AddMember("isStratigicLeg", obj->getIsStratigicLeg(), alloc); }
		if (0 == strcmp(fieldName, "isVIPLeg"))                { outV.AddMember("isVIPLeg", obj->getIsVIPLeg(), alloc); }
		if (0 == strcmp(fieldName, "base"))                    { Value v(obj->getBase().c_str(), alloc); outV.AddMember("base", v, alloc); }
		if (0 == strcmp(fieldName, "isOperating"))             { outV.AddMember("isOperating", obj->getIsOperating(), alloc); }
		if (0 == strcmp(fieldName, "isDeadhead"))              { outV.AddMember("isDeadhead", obj->isDeadhead(), alloc); }
		if (0 == strcmp(fieldName, "originalSeg"))             {}
		if (0 == strcmp(fieldName, "isCovered"))               { outV.AddMember("isCovered", obj->getIsCovered(), alloc); }
		if (0 == strcmp(fieldName, "expatMust"))               { outV.AddMember("expatMust", obj->getIsExpatMust(), alloc); }
		if (0 == strcmp(fieldName, "ICAO"))                    { outV.AddMember("ICAO", obj->getICAO(), alloc); }
		if (0 == strcmp(fieldName, "specialAirport"))          { outV.AddMember("specialAirport", obj->getIsSpecialAirport(), alloc); }
		if (0 == strcmp(fieldName, "isBusFerry"))              { outV.AddMember("isBusFerry", obj->isBusFerry(), alloc); }
		if (0 == strcmp(fieldName, "is1A"))                    { outV.AddMember("is1A", obj->getIs1A(), alloc); }
		if (0 == strcmp(fieldName, "is1B"))                    { outV.AddMember("is1B", obj->getIs1B(), alloc); }
		if (0 == strcmp(fieldName, "is2A"))                    { outV.AddMember("is2A", obj->getIs2A(), alloc); }
		if (0 == strcmp(fieldName, "is2B"))                    { outV.AddMember("is2B", obj->getIs2B(), alloc); }
		if (0 == strcmp(fieldName, "tailNum"))                 { Value v(obj->getTailNum().c_str(), alloc); outV.AddMember("tailNum", v, alloc); }
		if (0 == strcmp(fieldName, "pairingNum"))              { Value v(obj->getPairingNum().c_str(), alloc); outV.AddMember("pairingNum", v, alloc); }
		//if (0 == strcmp(fieldName, "crewLinkNum"))             { Value v(obj->getCrewLinkNum().c_str(), alloc); outV.AddMember("crewLinkNum", v, alloc); }
		if (0 == strcmp(fieldName, "assignment"))              { Value v(obj->getAssignment().c_str(), alloc); outV.AddMember("assignment", v, alloc); }
		if (0 == strcmp(fieldName, "isDhdPicked"))             { outV.AddMember("isDhdPicked", obj->getIsDhdPicked(), alloc); }
		if (0 == strcmp(fieldName, "blkMinHistory"))           { outV.AddMember("blkMinHistory", obj->getBlkMinHistory(), alloc); }
		if (0 == strcmp(fieldName, "numInDuty"))               { outV.AddMember("numInDuty", obj->getNumInDuty(), alloc); }
		if (0 == strcmp(fieldName, "utcStartTime"))            { char str[20] = { 0 }; utcToUtcStr(obj->getStartTimeUtcSch(), str, sizeof(str));  Value v(str, alloc); outV.AddMember("utcStartTime", v, alloc); }
		if (0 == strcmp(fieldName, "utcEndTime"))              { char str[20] = { 0 }; utcToUtcStr(obj->getEndTimeUtcSch(), str, sizeof(str));  Value v(str, alloc); outV.AddMember("utcEndTime", v, alloc); }
	}
	void setField(const char* fieldName, Value& v, void * o) {
		Segment * obj = (Segment*)o;
		if (0 == strcmp(fieldName, "id"))                      { obj->setId(v["id"].GetInt64()); }
		if (0 == strcmp(fieldName, "dbid"))                    { obj->setDBId(v["dbid"].GetInt64()); }
		//if (0 == strcmp(fieldName, "originalId"))              { obj->setOriginalId(v["originalId"].GetInt64()); }
		if (0 == strcmp(fieldName, "segNumber"))               { obj->setSegNumber(v["segNumber"].GetString()); }
		if (0 == strcmp(fieldName, "domIntType"))              { obj->setDomIntType(v["domIntType"].GetString()); }
		//if (0 == strcmp(fieldName, "schId"))                   { obj->setSchId(v["schId"].GetString()); }
		if (0 == strcmp(fieldName, "fleetCD"))                 { obj->setFleetCD(v["fleetCD"].GetString()); }
		if (0 == strcmp(fieldName, "blkTime"))                 { obj->setBlkTime(v["blkTime"].GetInt()); }
		if (0 == strcmp(fieldName, "depStation"))              { obj->setDepStation(v["depStation"].GetString()); }
		if (0 == strcmp(fieldName, "arrStation"))              { obj->setArrStation(v["arrStation"].GetString()); }
		if (0 == strcmp(fieldName, "_startTimeLocal_sch"))     { char* dtStr = (char*)v[fieldName].GetString(); time_t dt = utcStrToUtc(dtStr);  obj->setStartTimeLocSch(dt); }
		if (0 == strcmp(fieldName, "_endTimeLocal_sch"))       { char* dtStr = (char*)v[fieldName].GetString(); time_t dt = utcStrToUtc(dtStr);  obj->setEndTimeLocSch(dt); }
		if (0 == strcmp(fieldName, "nextLegNo"))               { obj->setNextLegNo(v["nextLegNo"].GetString()); }
		if (0 == strcmp(fieldName, "register"))				   { obj->setRegister(v["register"].GetString()); }
		if (0 == strcmp(fieldName, "relArcDy"))                { obj->setRelArcDy(v["relArcDy"].GetInt()); }
		if (0 == strcmp(fieldName, "depMinutesFromDayBegin"))  { obj->setDepMinutesFromDayBegin(v["depMinutesFromDayBegin"].GetInt()); }
		if (0 == strcmp(fieldName, "openComposition"))         { map<string, int> m; parseJsonToMapStrInt(v[fieldName], m); obj->setOpenComposition(m); }
		if (0 == strcmp(fieldName, "planComposition"))         { map<string, int> m; parseJsonToMapStrInt(v[fieldName], m); obj->setPlanComposition(m); }
		if (0 == strcmp(fieldName, "fillComposition"))         { map<string, int> m; parseJsonToMapStrInt(v[fieldName], m); obj->setFillComposition(m); }
		if (0 == strcmp(fieldName, "compositionId"))           { obj->setCompositionId(v["compositionId"].GetInt64()); }
		if (0 == strcmp(fieldName, "compositionHierarchy"))    { obj->setCompositionHierarchy(v["compositionHierarchy"].GetInt()); }
		if (0 == strcmp(fieldName, "turnTime"))                { obj->setTurnTime(v["turnTime"].GetInt()); }
		if (0 == strcmp(fieldName, "isMustStartDuty"))         { obj->setIsMustStartDuty(v["isMustStartDuty"].GetBool()); }
		if (0 == strcmp(fieldName, "isMustEndDuty"))           { obj->setIsMustEndDuty(v["isMustEndDuty"].GetBool()); }
		if (0 == strcmp(fieldName, "isStratigicLeg"))          { obj->setIsStratigicLeg(v["isStratigicLeg"].GetBool()); }
		if (0 == strcmp(fieldName, "isVIPLeg"))                { obj->setIsVIPLeg(v["isVIPLeg"].GetBool()); }
		if (0 == strcmp(fieldName, "base"))                    { obj->setBase(v["base"].GetString()); }
		if (0 == strcmp(fieldName, "isOperating"))             { obj->setIsOperating(v["isOperating"].GetBool()); }
		if (0 == strcmp(fieldName, "isDeadhead"))              { obj->setIsDeadhead(v["isDeadhead"].GetBool()); }
		if (0 == strcmp(fieldName, "originalSeg"))             {}
		if (0 == strcmp(fieldName, "isCovered"))               { obj->setIsCovered(v["isCovered"].GetBool()); }
		if (0 == strcmp(fieldName, "expatAllow"))              { obj->setIsExpatAllow(v["expatAllow"].GetBool()); }
		if (0 == strcmp(fieldName, "expatMust"))               { obj->setIsExpatMust(v["expatMust"].GetBool()); }
		if (0 == strcmp(fieldName, "ICAO"))                    { obj->setICAO(v["ICAO"].GetBool()); }
		if (0 == strcmp(fieldName, "specialAirport"))          { obj->setIsSpecialAirport(v["specialAirport"].GetBool()); }
		if (0 == strcmp(fieldName, "isBusFerry"))              { obj->setIsBusFerry(v["isBusFerry"].GetBool()); }
		if (0 == strcmp(fieldName, "is1A"))                    { obj->setIs1A(v["is1A"].GetBool()); }
		if (0 == strcmp(fieldName, "is1B"))                    { obj->setIs1B(v["is1B"].GetBool()); }
		if (0 == strcmp(fieldName, "is2A"))                    { obj->setIs2A(v["is2A"].GetBool()); }
		if (0 == strcmp(fieldName, "is2B"))                    { obj->setIs2B(v["is2B"].GetBool()); }
		if (0 == strcmp(fieldName, "tailNum"))                 { obj->setTailNum(v["tailNum"].GetString()); }
		if (0 == strcmp(fieldName, "pairingNum"))              { obj->setPairingNum(v["pairingNum"].GetString()); }
		if (0 == strcmp(fieldName, "crewLinkNum"))             { obj->setCrewLinkNum(v["crewLinkNum"].GetString()); }
		if (0 == strcmp(fieldName, "assignment"))              { obj->setAssignment(v["assignment"].GetString()); }
		if (0 == strcmp(fieldName, "isDhdPicked"))             { obj->setIsDhdPicked(v["isDhdPicked"].GetBool()); }
		if (0 == strcmp(fieldName, "blkMinHistory"))           { obj->setBlkMinHistory(v["blkMinHistory"].GetInt()); }
		if (0 == strcmp(fieldName, "numInDuty"))               { obj->setNumInDuty(v["numInDuty"].GetInt()); }
		if (0 == strcmp(fieldName, "utcStartTime"))            { char* dtStr = (char*)v[fieldName].GetString(); time_t dt = utcStrToUtc(dtStr);  obj->setStartTimeUtcSch(dt); }
		if (0 == strcmp(fieldName, "utcEndTime"))              { char* dtStr = (char*)v[fieldName].GetString(); time_t dt = utcStrToUtc(dtStr);  obj->setEndTimeUtcSch(dt); }
	}
};



#endif//_SEGMENT_JSON_H_