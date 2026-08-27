#ifndef _PAIRING_JSON_H_
#define _PAIRING_JSON_H_
#include <string>
#include <vector>
#include <map>
#include "rapidjson/document.h"		// rapidjson's DOM-style API
#include "rapidjson/prettywriter.h"	// for stringify JSON
#include "rapidjson/filestream.h"	// wrapper of C stream for prettywriter as output
#include "rapidjson/stringbuffer.h"	// wrapper of C stream for prettywriter as output
#include "UtilFunc.h"
#include "JsonUtil.h"
#include "..\Pairing.h"
using namespace std;
using namespace rapidjson;

class PairingJson : public JsonParserItem {
private:
	vector<char*> fieldNames;
public:

	//Json字段列表，确定哪些c++字段是需要转为json
	PairingJson() { vector<char*> list = { "dutyVec", 
		"schStartTimeUtc", "schEndTimeUtc", "schStartTimeLoc", "schEndTimeLoc", "schEndTimeUtcIncludeRest", "schEndTimeLocIncludeRest", "actStartTimeUtc", "actEndTimeUtc", "actStartTimeLoc", "actEndTimeLoc", "actEndTimeUtcIncludeRest", "actEndTimeLocIncludeRest",
		"base", "fltCode", "id", "flyingHours", "isBlkOverNormal", "pairingNum", "pgFDP", "pgDP", "pgBLK", "fdp", "dp", "blk", "averageBlk", "numCrewDays", "numDaysIncludeRest", "complements", "openComposition", "compositionId", "compositionHierarchy", "aircraftChangePoints", "totalLandingPoints", "totalDifficultAirportPoints", "blkPoints", "turnTimePoints", "earlyDepPoints", "lateArrPoints", "dutyBlkPoints", "dutyFdpPoints", "layoverStationChangePoints", "blankDayWithinPairingPoints", "totalFatiguePoints", "fatigueCurve", "primeActivity", "region", "cost", "incentiveFlyAllowance", "mealAllowance", "overnightAllowance", "hotelCost", "crewDayCost", "numBlankDays", "numPicksInPostOptimizer", "pairingAttributes", "attribute", "dbid", "isLegal=true", "vilationMessages", "scenarioId" }; fieldNames = list; }

	void* createNew() { return (void*) new Pairing(); }

	vector<char*> getFieldNames() { return fieldNames; }

	void getField(const char* fieldName, void * o, Document::AllocatorType& alloc, Value& outV) {
		Pairing * obj = (Pairing*)o;
		if (0 == strcmp(fieldName, "dutyVec"))                 {}

		if (0 == strcmp(fieldName, "schStartTimeUtc"))         { outV.AddMember("schStartTimeUtc", obj->getStartTimeUtcSch(), alloc); }
		if (0 == strcmp(fieldName, "schEndTimeUtc"))           { outV.AddMember("schEndTimeUtc", obj->getEndTimeUtcSch(), alloc); }
		if (0 == strcmp(fieldName, "schStartTimeLoc"))         { outV.AddMember("schStartTimeLoc", obj->getStartTimeLocSch(), alloc); }
		if (0 == strcmp(fieldName, "schEndTimeLoc"))           { outV.AddMember("schEndTimeLoc", obj->getEndTimeLocSch(), alloc); }
		if (0 == strcmp(fieldName, "schEndTimeUtcIncludeRest")){ outV.AddMember("schEndTimeUtcIncludeRest", obj->getEndTimeIncludingRestUtcSch(), alloc); }
		if (0 == strcmp(fieldName, "schEndTimeLocIncludeRest")){ outV.AddMember("schEndTimeLocIncludeRest", obj->getEndTimeIncludingRestLocSch(), alloc); }
		if (0 == strcmp(fieldName, "actStartTimeUtc"))         { outV.AddMember("actStartTimeUtc", obj->getStartTimeUtcAct(), alloc); }
		if (0 == strcmp(fieldName, "actEndTimeUtc"))           { outV.AddMember("actEndTimeUtc", obj->getEndTimeUtcAct(), alloc); }
		if (0 == strcmp(fieldName, "actStartTimeLoc"))         { outV.AddMember("actStartTimeLoc", obj->getStartTimeLocAct(), alloc); }
		if (0 == strcmp(fieldName, "actEndTimeLoc"))           { outV.AddMember("actEndTimeLoc", obj->getEndTimeLocAct(), alloc); }
		if (0 == strcmp(fieldName, "actEndTimeUtcIncludeRest")){ outV.AddMember("actEndTimeUtcIncludeRest", obj->getEndTimeIncludingRestUtcAct(), alloc); }
		if (0 == strcmp(fieldName, "actEndTimeLocIncludeRest")){ outV.AddMember("actEndTimeLocIncludeRest", obj->getEndTimeIncludingRestLocAct(), alloc); }

		if (0 == strcmp(fieldName, "base"))                    { Value v(obj->getBase().c_str(), alloc); outV.AddMember("base", v, alloc); }
		if (0 == strcmp(fieldName, "fltCode"))                 { Value v(obj->getFltCode().c_str(), alloc); outV.AddMember("fltCode", v, alloc); }
		if (0 == strcmp(fieldName, "id"))                      { outV.AddMember("id", obj->getId(), alloc); }
		if (0 == strcmp(fieldName, "flyingHours"))             { outV.AddMember("flyingHours", obj->getFlyingHours(), alloc); }
		if (0 == strcmp(fieldName, "isBlkOverNormal"))         { outV.AddMember("isBlkOverNormal", obj->getIsBlkOverNormal(), alloc); }
		if (0 == strcmp(fieldName, "pairingNum"))              { Value v(obj->getPairingNum().c_str(), alloc); outV.AddMember("pairingNum", v, alloc); }
		if (0 == strcmp(fieldName, "pgFDP"))                   { Value v(kArrayType); vector<int> list = obj->getPgFDP(); for (std::size_t i = 0; i < list.size(); i++) { v.PushBack(list[i], alloc); } outV.AddMember("pgFDP", v, alloc); }
		if (0 == strcmp(fieldName, "pgDP"))                    { Value v(kArrayType); vector<int> list = obj->getPgDP(); for (std::size_t i = 0; i < list.size(); i++) { v.PushBack(list[i], alloc); } outV.AddMember("pgDP", v, alloc); }
		if (0 == strcmp(fieldName, "pgBLK"))                   { Value v(kArrayType); vector<int> list = obj->getPgBLK(); for (std::size_t i = 0; i < list.size(); i++) { v.PushBack(list[i], alloc); } outV.AddMember("pgBLK", v, alloc); }
		if (0 == strcmp(fieldName, "fdp"))                     { outV.AddMember("fdp", obj->getFdp(), alloc); }
		if (0 == strcmp(fieldName, "dp"))                      { outV.AddMember("dp", obj->getDp(), alloc); }
		if (0 == strcmp(fieldName, "blk"))                     { outV.AddMember("blk", obj->getBlk(), alloc); }
		if (0 == strcmp(fieldName, "averageBlk"))              { outV.AddMember("averageBlk", obj->getAverageBlk(), alloc); }
		if (0 == strcmp(fieldName, "numCrewDays"))             { outV.AddMember("numCrewDays", obj->getNumCrewDays(), alloc); }
		if (0 == strcmp(fieldName, "numDaysIncludeRest"))      { outV.AddMember("numDaysIncludeRest", obj->getNumDaysIncludeRest(), alloc); }
		if (0 == strcmp(fieldName, "complements"))             { Value v(kObjectType); map<string, int> m = obj->getComplements(); for (map<string, int>::iterator it = m.begin(); it != m.end(); it++) { addIntField(v, it->first.c_str(), it->second, alloc); } outV.AddMember("complements", v, alloc); }
		if (0 == strcmp(fieldName, "openComposition"))         { Value v(kObjectType); map<string, int> m = obj->getOpenComposition(); for (map<string, int>::iterator it = m.begin(); it != m.end(); it++) { addIntField(v, it->first.c_str(), it->second, alloc); } outV.AddMember("openComposition", v, alloc); }
		if (0 == strcmp(fieldName, "compositionId"))           { outV.AddMember("compositionId", obj->getCompositionId(), alloc); }
		if (0 == strcmp(fieldName, "compositionHierarchy"))    { outV.AddMember("compositionHierarchy", obj->getCompositionHierarchy(), alloc); }
		if (0 == strcmp(fieldName, "aircraftChangePoints"))    { outV.AddMember("aircraftChangePoints", obj->getAircraftChangePoints(), alloc); }
		if (0 == strcmp(fieldName, "totalLandingPoints"))      { outV.AddMember("totalLandingPoints", obj->getTotalLandingPoints(), alloc); }
		if (0 == strcmp(fieldName, "totalDifficultAirportPoints")){ outV.AddMember("totalDifficultAirportPoints", obj->getTotalDifficultAirportPoints(), alloc); }
		if (0 == strcmp(fieldName, "blkPoints"))               { outV.AddMember("blkPoints", obj->getBlkPoints(), alloc); }
		if (0 == strcmp(fieldName, "turnTimePoints"))          { outV.AddMember("turnTimePoints", obj->getTurnTimePoints(), alloc); }
		if (0 == strcmp(fieldName, "earlyDepPoints"))          { outV.AddMember("earlyDepPoints", obj->getEarlyDepPoints(), alloc); }
		if (0 == strcmp(fieldName, "lateArrPoints"))           { outV.AddMember("lateArrPoints", obj->getLateArrPoints(), alloc); }
		if (0 == strcmp(fieldName, "dutyBlkPoints"))           { outV.AddMember("dutyBlkPoints", obj->getDutyBlkPoints(), alloc); }
		if (0 == strcmp(fieldName, "dutyFdpPoints"))           { outV.AddMember("dutyFdpPoints", obj->getDutyFdpPoints(), alloc); }
		if (0 == strcmp(fieldName, "layoverStationChangePoints")){ outV.AddMember("layoverStationChangePoints", obj->getLayoverStationChangePoints(), alloc); }
		if (0 == strcmp(fieldName, "blankDayWithinPairingPoints")){ outV.AddMember("blankDayWithinPairingPoints", obj->getBlankDayWithinPairingPoints(), alloc); }
		if (0 == strcmp(fieldName, "totalFatiguePoints"))      { outV.AddMember("totalFatiguePoints", obj->getTotalFatiguePoints(), alloc); }
		if (0 == strcmp(fieldName, "fatigueCurve"))            { Value v(kObjectType); map<long, double> m = obj->getFatigueCurve(); for (map<long, double>::iterator it = m.begin(); it != m.end(); it++) { char num[40] = { 0 }; itoa(it->first, num, sizeof(num) - 1); addDoubleField(v, num, it->second, alloc); } outV.AddMember("fatigueCurve", v, alloc); }
		if (0 == strcmp(fieldName, "primeActivity"))           { Value v(obj->getPrimeActivity().c_str(), alloc); outV.AddMember("primeActivity", v, alloc); }
		if (0 == strcmp(fieldName, "region"))                  { Value v(obj->getRegion().c_str(), alloc); outV.AddMember("region", v, alloc); }
		if (0 == strcmp(fieldName, "cost"))                    { outV.AddMember("cost", obj->getCost(), alloc); }
		if (0 == strcmp(fieldName, "incentiveFlyAllowance"))   { outV.AddMember("incentiveFlyAllowance", obj->getIncentiveFlyAllowance(), alloc); }
		if (0 == strcmp(fieldName, "mealAllowance"))           { outV.AddMember("mealAllowance", obj->getMealAllowance(), alloc); }
		if (0 == strcmp(fieldName, "overnightAllowance"))      { outV.AddMember("overnightAllowance", obj->getOvernightAllowance(), alloc); }
		if (0 == strcmp(fieldName, "hotelCost"))               { outV.AddMember("hotelCost", obj->getHotelCost(), alloc); }
		if (0 == strcmp(fieldName, "crewDayCost"))             { outV.AddMember("crewDayCost", obj->getCrewDayCost(), alloc); }
		if (0 == strcmp(fieldName, "numBlankDays"))            { outV.AddMember("numBlankDays", obj->getNumBlankDays(), alloc); }
		if (0 == strcmp(fieldName, "numPicksInPostOptimizer")) { outV.AddMember("numPicksInPostOptimizer", obj->getNumPicksInPostOptimizer(), alloc); }
		if (0 == strcmp(fieldName, "pairingAttributes"))       {}
		if (0 == strcmp(fieldName, "attribute"))               { Value v(obj->getAttribute().c_str(), alloc); outV.AddMember("attribute", v, alloc); }
		if (0 == strcmp(fieldName, "dbid"))                    { outV.AddMember("dbid", obj->getDbid(), alloc); }
		if (0 == strcmp(fieldName, "vilationMessages"))       { Value v(kArrayType); vector<string> list = obj->getVilationMessages(); for (std::size_t i = 0; i < list.size(); i++) { Value str(list[i].c_str(), alloc); v.PushBack(str, alloc); } outV.AddMember("vilationMessages", v, alloc); }
		if (0 == strcmp(fieldName, "scenarioId"))              { outV.AddMember("scenarioId", obj->getScenarioId(), alloc); }
	}
	void setField(const char* fieldName, Value& v, void * o) {
		Pairing * obj = (Pairing*)o;
		if (0 == strcmp(fieldName, "dutyVec"))                 {}

		if (0 == strcmp(fieldName, "schStartTimeUtc"))         { obj->setStartTimeUtcSch(v["schStartTimeUtc"].GetInt()); }
		if (0 == strcmp(fieldName, "schEndTimeUtc"))           { obj->setEndTimeUtcSch(v["schEndTimeUtc"].GetInt()); }
		if (0 == strcmp(fieldName, "schStartTimeLoc"))         { obj->setStartTimeLocSch(v["schStartTimeLoc"].GetInt()); }
		if (0 == strcmp(fieldName, "schEndTimeLoc"))           { obj->setEndTimeLocSch(v["schEndTimeLoc"].GetInt()); }
		if (0 == strcmp(fieldName, "schEndTimeUtcIncludeRest")){  }
		if (0 == strcmp(fieldName, "schEndTimeLocIncludeRest")){  }
		if (0 == strcmp(fieldName, "actStartTimeUtc"))         { obj->setStartTimeUtcAct(v["actStartTimeUtc"].GetInt()); }
		if (0 == strcmp(fieldName, "actEndTimeUtc"))           { obj->setEndTimeUtcAct(v["actEndTimeUtc"].GetInt()); }
		if (0 == strcmp(fieldName, "actStartTimeLoc"))         { obj->setStartTimeLocAct(v["actStartTimeLoc"].GetInt()); }
		if (0 == strcmp(fieldName, "actEndTimeLoc"))           { obj->setEndTimeLocAct(v["actEndTimeLoc"].GetInt()); }
		if (0 == strcmp(fieldName, "actEndTimeUtcIncludeRest")){  }
		if (0 == strcmp(fieldName, "actEndTimeLocIncludeRest")){  }

		if (0 == strcmp(fieldName, "base"))                    { obj->setBase(string(v["base"].GetString())); }
		if (0 == strcmp(fieldName, "fltCode"))                 { obj->setFltCode(string(v["fltCode"].GetString())); }
		if (0 == strcmp(fieldName, "id"))                      { obj->setId(v["id"].GetInt64()); }
		if (0 == strcmp(fieldName, "flyingHours"))             { obj->setFlyingHours(v["flyingHours"].GetDouble()); }
		if (0 == strcmp(fieldName, "isBlkOverNormal"))         { obj->setIsBlkOverNormal(v["isBlkOverNormal"].GetBool()); }
		//if (0 == strcmp(fieldName, "pairingNum"))              { obj->setPairingNum(v["pairingNum"].GetString()); }
		if (0 == strcmp(fieldName, "pgFDP"))                   { vector<int> list; Value &item = v[fieldName]; for (SizeType i = 0; i < item.Size(); i++) { list.push_back(item[i].GetInt()); } obj->setPgFDP(list); }
		if (0 == strcmp(fieldName, "pgDP"))                    { vector<int> list; Value &item = v[fieldName]; for (SizeType i = 0; i < item.Size(); i++) { list.push_back(item[i].GetInt()); } obj->setPgDP(list); }
		if (0 == strcmp(fieldName, "pgBLK"))                   { vector<int> list; Value &item = v[fieldName]; for (SizeType i = 0; i < item.Size(); i++) { list.push_back(item[i].GetInt()); } obj->setPgBLK(list); }
		if (0 == strcmp(fieldName, "fdp"))                     { obj->setFdp(v["fdp"].GetInt()); }
		if (0 == strcmp(fieldName, "dp"))                      { obj->setDp(v["dp"].GetInt()); }
		if (0 == strcmp(fieldName, "blk"))                     { obj->setBlk(v["blk"].GetInt()); }
		if (0 == strcmp(fieldName, "averageBlk"))              { obj->setAverageBlk(v["averageBlk"].GetDouble()); }
		if (0 == strcmp(fieldName, "numCrewDays"))             { obj->setNumCrewDays(v["numCrewDays"].GetInt()); }
		if (0 == strcmp(fieldName, "numDaysIncludeRest"))      { obj->setNumDaysIncludeRest(v["numDaysIncludeRest"].GetInt()); }
		if (0 == strcmp(fieldName, "complements"))             { map<string, int> m; parseJsonToMapStrInt(v[fieldName], m); obj->setComplements(m); }
		if (0 == strcmp(fieldName, "openComposition"))         { map<string, int> m; parseJsonToMapStrInt(v[fieldName], m); obj->setOpenComposition(m); }
		if (0 == strcmp(fieldName, "compositionId"))           { obj->setCompositionId(v["compositionId"].GetInt64()); }
		if (0 == strcmp(fieldName, "compositionHierarchy"))    { obj->setCompositionHierarchy(v["compositionHierarchy"].GetInt()); }
		if (0 == strcmp(fieldName, "aircraftChangePoints"))    { obj->setAircraftChangePoints(v["aircraftChangePoints"].GetDouble()); }
		if (0 == strcmp(fieldName, "totalLandingPoints"))      { obj->setTotalLandingPoints(v["totalLandingPoints"].GetDouble()); }
		if (0 == strcmp(fieldName, "totalDifficultAirportPoints")){ obj->setTotalDifficultAirportPoints(v["totalDifficultAirportPoints"].GetDouble()); }
		if (0 == strcmp(fieldName, "blkPoints"))               { obj->setBlkPoints(v["blkPoints"].GetDouble()); }
		if (0 == strcmp(fieldName, "turnTimePoints"))          { obj->setTurnTimePoints(v["turnTimePoints"].GetDouble()); }
		if (0 == strcmp(fieldName, "earlyDepPoints"))          { obj->setEarlyDepPoints(v["earlyDepPoints"].GetDouble()); }
		if (0 == strcmp(fieldName, "lateArrPoints"))           { obj->setLateArrPoints(v["lateArrPoints"].GetDouble()); }
		if (0 == strcmp(fieldName, "dutyBlkPoints"))           { obj->setDutyBlkPoints(v["dutyBlkPoints"].GetDouble()); }
		if (0 == strcmp(fieldName, "dutyFdpPoints"))           { obj->setDutyFdpPoints(v["dutyFdpPoints"].GetDouble()); }
		if (0 == strcmp(fieldName, "layoverStationChangePoints")){ obj->setLayoverStationChangePoints(v["layoverStationChangePoints"].GetDouble()); }
		if (0 == strcmp(fieldName, "blankDayWithinPairingPoints")){ obj->setBlankDayWithinPairingPoints(v["blankDayWithinPairingPoints"].GetDouble()); }
		if (0 == strcmp(fieldName, "totalFatiguePoints"))      { obj->setTotalFatiguePoints(v["totalFatiguePoints"].GetDouble()); }
		if (0 == strcmp(fieldName, "fatigueCurve"))            { map<long, double> m; parseJsonToMapLongDouble(v[fieldName], m); obj->setFatigueCurve(m); }
		if (0 == strcmp(fieldName, "primeActivity"))           { obj->setPrimeActivity(string(v["primeActivity"].GetString())); }
		if (0 == strcmp(fieldName, "region"))                  { obj->setRegion(v["region"].GetString()); }
		if (0 == strcmp(fieldName, "cost"))                    { obj->setCost(v["cost"].GetDouble()); }
		if (0 == strcmp(fieldName, "incentiveFlyAllowance"))   { obj->setIncentiveFlyAllowance(v["incentiveFlyAllowance"].GetDouble()); }
		if (0 == strcmp(fieldName, "mealAllowance"))           { obj->setMealAllowance(v["mealAllowance"].GetDouble()); }
		if (0 == strcmp(fieldName, "overnightAllowance"))      { obj->setOvernightAllowance(v["overnightAllowance"].GetDouble()); }
		if (0 == strcmp(fieldName, "hotelCost"))               { obj->setHotelCost(v["hotelCost"].GetDouble()); }
		if (0 == strcmp(fieldName, "crewDayCost"))             { obj->setCrewDayCost(v["crewDayCost"].GetDouble()); }
		if (0 == strcmp(fieldName, "numBlankDays"))            { obj->setNumBlankDays(v["numBlankDays"].GetInt()); }
		if (0 == strcmp(fieldName, "numPicksInPostOptimizer")) { obj->setNumPicksInPostOptimizer(v["numPicksInPostOptimizer"].GetInt()); }
		if (0 == strcmp(fieldName, "pairingAttributes"))       {}
		if (0 == strcmp(fieldName, "attribute"))               { obj->setAttribute(v["attribute"].GetString()); }
		if (0 == strcmp(fieldName, "dbid"))                    { obj->setDbid(v["dbid"].GetInt64()); }
		if (0 == strcmp(fieldName, "vilationMessages"))       { vector<string> list; Value &item = v[fieldName]; for (SizeType i = 0; i < item.Size(); i++) { list.push_back(item[i].GetString()); } obj->setVilationMessages(list); }
		if (0 == strcmp(fieldName, "scenarioId"))              { obj->setScenarioId(v["scenarioId"].GetInt64()); }
		if (0 == strcmp(fieldName, "courseCode"))              { obj->SetCourseCode(v["courseCode"].GetString()); }
		if (0 == strcmp(fieldName, "courseType"))              { obj->SetCourseType(v["courseType"].GetString()); }
	}
};


#endif//_PAIRING_JSON_H_