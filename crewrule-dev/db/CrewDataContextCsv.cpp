/*
CrewDataContextCsv.cpp
1 读写CSV接口封装
2 接口
  loadDataCsv
*/

#include <stdio.h>
#include <vector>
#include <algorithm>
#include <set>

#include <memory>
#include <iostream>
#include <fstream>
#include <time.h>
#include "Pairing.h"
#include "Duty.h"
#include "Segment.h"
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "TestDBFunc.h"
#include "UtilFunc.h"
#include "OrLog.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "DataCheck.h"
#include "Utility.h"
#include "CrewMonthManday.h"
#include "PortLOStatistics.h"

#include "OrLog.h"
#include "Log/Logger.h"
#include "csv/csv_impl.h"
#include "CustomBiz/CustomBiz.h"
#include "CsvStreamUtil.h"
#include "index/TmTrainingConfigIndex.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"
#include "index/TmFootprintIndex.h"
#include "index/TmPairingIndex.h"
#include "index/CrewRpRecencyIndex.h"
#include "CrewDataValidation.h"
#include "TimezoneUtils.h"
#include "PairingUtil.h"
#include "PairingAttrCalculator.h"
#include "PairingCompositionCalculator.h"
#include "RuleParams.h"

using namespace std;

string fltInfo(long long fltId, CrewDataContext* dbData);
void getTableNumFromNameStr(const char * names, char * buf, int bufsize);
void getRowNumFromNameStr(const char * names, char * buf, int bufsize);

void mergePairingAndDuty(unordered_map<long long, Pairing*>& pairingIdMap, vector<Duty*>& dutyList);
void mergeDutyAndSegment(map<long long, Duty*>& dutyIdMap, vector<Segment*>& segmentList);
DBRule makeMixRuleByCsv(DBRule* originObj, long long ruleSet, csvRuleParam * item);
DBRule makeTableRuleByCsv(map<string, vector<string>>& ruleIdHeaderMap, DBRule* originObj, long long ruleSet, csvRuleParam * item);
void saveCsvRuleParameter(crewCsvReader& reader, ofstream& outfile, string name, vector<DBRule>& list);
void resetCrewBaseUtcByLoc(CrewDataContext* dataCtx);
void fixDataMissingRosterFlight(CrewDataContext* dataCtx);
void fixRosterByPairing(CrewDataContext* dataCtx);
void fixRosterFlight(CrewDataContext* dbData);//20201110 ain, mantis#8798, 补齐缺失的数据, rosterFlt, 确保8072等依赖rosterFlt的法规执行正常
void computeFlightSegmentComposition(time_t scenarioStartUtc, unordered_map<long long, SharedPtr<Segment>>& flightIdMap, unordered_map<long long, Segment*>& ferryFlightIdMap, vector<Pairing*>& pairingList);

//20200311 ain, 兼容vs2013/2017
#ifdef _WIN32
	#ifndef timezone
	#define timezone _timezone
	#endif
#endif

/*
8126法规性能优化，提前保存被过滤的法规，避免后面无效循环
*/
string CrewDataContext::filterQualsByCombsRules()
{
	string combs;
	for (const auto& rule : this->ruleList)
	{
		if (rule.function != 8126)
			continue;

		for (const auto& iter : rule.params)
		{
			if (iter.first == "QUAL COMBINATIONS")
				combs = combs + "#" + iter.second;
		}
	}
	return combs;
}

int CrewDataContext::loadDataUpdateCrew(const char * filepath, DtoUpdateCrew& dto){
	int errorCode = 0;
	size_t i = 0;
	size_t j = 0;
	string dbg = "";
	DataCheck dataChecker;
	try {
		Logger::getRuleLogger()->info("loadDataCsv start");

		//read csv
		dbg = "reader.readMutiTableCsv";
		crewCsvReader reader;
		reader.readMutiTableCsv(filepath);
		Logger::getRuleLogger()->debug("read csv split_cost={} ms", (split_cost / 1000000));

		vector<void*>& csvCrewLastPublishDateList = reader.datas["CrewLastPublishDate"];

		dbg = "CrewLastPublishDate";
		for (i = 0; i < csvCrewLastPublishDateList.size(); i++) {
			shared_ptr<CrewLastPublishDate> copy(new CrewLastPublishDate(*(CrewLastPublishDate*)csvCrewLastPublishDateList[i]));
			dto.updateCrewLastPublishDates.push_back(copy);
		}
		if (!dto.updateCrewLastPublishDates.empty()) {
			return errorCode;

		}

		dbg = "Crew";

		vector<void*>& csvCrewList = reader.datas["Crew"];
		vector<void*>& csvCrewStatusList = reader.datas["CrewStatus"];
		vector<void*>& csvCrewRankList = reader.datas["CrewRank"];
		vector<void*>& csvCrewCompanyRankList = reader.datas["CrewCompanyRank"];
		vector<void*>& csvCrewBaseList = reader.datas["CrewBase"];
		vector<void*>& csvCrewFleetList = reader.datas["CrewFleet"];
		vector<void*>& csvCrewQualList = reader.datas["CrewQualification"];
		vector<void*>& csvCrewCertificateList = reader.datas["CrewCertificate"];
		vector<void*>& csvCrewLicenseList = reader.datas["CrewLicense"];
		vector<void*>& csvCrewLanguageList = reader.datas["CrewLanguage"];
		vector<void*>& csvCrewGuaranteeHourList = reader.datas["CrewGuaranteeHour"];
		vector<void*>& csvCrewFirstDutyInfoList = reader.datas["CrewFirstDutyInfo"];
		vector<void*>& csvCrewIdList = reader.datas["CrewId"];
		for (i = 0; i < csvCrewList.size(); i++) {
			shared_ptr<CREW> crew(new CREW(*(CREW*)csvCrewList[i]));
			dto.addOrupdateCrewIdMap[crew->idCrew] = crew;
			dto.addOrUpdateCrews.push_back(crew);
		}

		Logger::getRuleLogger()->info("parse crew size={}", crewList.size());
		dbg = "CrewStatus";
		for (i = 0; i < csvCrewStatusList.size(); i++) {
			shared_ptr<CREW_STATUS> copy(new CREW_STATUS(*(CREW_STATUS*)csvCrewStatusList[i]));
			if (dto.addOrupdateCrewIdMap.find(copy->idcrew) == dto.addOrupdateCrewIdMap.end()) {
				Logger::getRuleLogger()->error("[loadDataUpdateCrew] ERROR: invalid crew_status data, crew={} not found", copy->idcrew);
				continue;
			}
			shared_ptr<CREW> crew = dto.addOrupdateCrewIdMap[copy->idcrew];
			crew->statusList.push_back(copy);
		}

		dbg = "CrewRank";
		for (i = 0; i < csvCrewRankList.size(); i++) {
			shared_ptr<CREW_RANK> copy(new CREW_RANK(*(CREW_RANK*)csvCrewRankList[i]));
			if (dto.addOrupdateCrewIdMap.find(copy->idCrew) == dto.addOrupdateCrewIdMap.end()) {
				Logger::getRuleLogger()->error("[loadDataUpdateCrew] ERROR: invalid crew_rank data, crew={} not found", copy->idCrew);
				continue;
			}
			shared_ptr<CREW> crew = dto.addOrupdateCrewIdMap[copy->idCrew];
			crew->rankList.push_back(copy);
		}
		dbg = "CrewCompanyRank";
		for (i = 0; i < csvCrewCompanyRankList.size(); i++) {
			shared_ptr<CREW_COMPANY_RANK> copy(new CREW_COMPANY_RANK(*(CREW_COMPANY_RANK*)csvCrewCompanyRankList[i]));
			if (dto.addOrupdateCrewIdMap.find(copy->idCrew) == dto.addOrupdateCrewIdMap.end()) {
				Logger::getRuleLogger()->error("[loadDataUpdateCrew] ERROR: invalid crew_company_rank data, crew={} not found", copy->idCrew);
				continue;
			}
			shared_ptr<CREW> crew = dto.addOrupdateCrewIdMap[copy->idCrew];
			crew->companyRankList.push_back(copy);
		}
		dbg = "CrewBase";
		for (i = 0; i < csvCrewBaseList.size(); i++) {
			shared_ptr<CREW_BASE> copy(new CREW_BASE(*(CREW_BASE*)csvCrewBaseList[i]));

			//mantis#2493
			int offsetMinutes = timezone / 60;
			if (airportUtcOffsetMap.find(copy->base) != airportUtcOffsetMap.end())
				offsetMinutes = airportUtcOffsetMap[copy->base];
			copy->effUtc = copy->effLoc - 60 * offsetMinutes;
			copy->expUtc = copy->expLoc - 60 * offsetMinutes;

			if (dto.addOrupdateCrewIdMap.find(copy->idCrew) == dto.addOrupdateCrewIdMap.end()) {
				Logger::getRuleLogger()->error("[loadDataUpdateCrew] ERROR: invalid crew_base data, crew={} not found", copy->idCrew);
				continue;
			}
			shared_ptr<CREW> crew = dto.addOrupdateCrewIdMap[copy->idCrew];
			crew->baseList.push_back(copy);
		}
		dbg = "CrewFleet";
		for (i = 0; i < csvCrewFleetList.size(); i++) {
			shared_ptr<CREW_FLEET> copy(new CREW_FLEET(*(CREW_FLEET*)csvCrewFleetList[i]));
			if (dto.addOrupdateCrewIdMap.find(copy->idCrew) == dto.addOrupdateCrewIdMap.end()) {
				Logger::getRuleLogger()->error("[loadDataUpdateCrew] ERROR: invalid crew_fleet data, crew={} not found", copy->idCrew);
				continue;
			}
			shared_ptr<CREW> crew = dto.addOrupdateCrewIdMap[copy->idCrew];
			crew->fleetList.push_back(copy);
		}
		dbg = "CrewQual";
		for (i = 0; i < csvCrewQualList.size(); i++) {
			shared_ptr<CREW_QUALIFICATION> copy(new CREW_QUALIFICATION(*(CREW_QUALIFICATION*)csvCrewQualList[i]));
			if (dto.addOrupdateCrewIdMap.find(copy->idCrew) == dto.addOrupdateCrewIdMap.end()) {
				Logger::getRuleLogger()->error("[loadDataUpdateCrew] ERROR: invalid crew_qual data, crew={} not found", copy->idCrew);
				continue;
			}
			shared_ptr<CREW> crew = dto.addOrupdateCrewIdMap[copy->idCrew];
			crew->qualificationList.push_back(copy);
			
			string combQuals = filterQualsByCombsRules();
			if (combQuals.find(copy->qual) != std::string::npos) {
				crew->qualListFiltedByRules[copy->qual] = copy;
			}

			shared_ptr<CREW_QUALIFICATION> copyInDb(new CREW_QUALIFICATION(*(CREW_QUALIFICATION*)csvCrewQualList[i]));
			crew->qualificationListInDb.push_back(copyInDb);
		}
		dbg = "CrewCertificate";
		for (i = 0; i < csvCrewCertificateList.size(); i++) {
			shared_ptr<CREW_QUALIFICATION> copy(new CREW_QUALIFICATION(*(CREW_QUALIFICATION*)csvCrewCertificateList[i]));
			if (dto.addOrupdateCrewIdMap.find(copy->idCrew) == dto.addOrupdateCrewIdMap.end()) {
				Logger::getRuleLogger()->error("[loadDataUpdateCrew] ERROR: invalid crew_certificate data, crew={} not found", copy->idCrew);
				continue;
			}
			shared_ptr<CREW> crew = dto.addOrupdateCrewIdMap[copy->idCrew];
			crew->qualificationList.push_back(copy);

			string combQuals = filterQualsByCombsRules();
			if (combQuals.find(copy->qual) != std::string::npos) {
				crew->qualListFiltedByRules[copy->qual] = copy;
			}

			shared_ptr<CREW_QUALIFICATION> copyInDb(new CREW_QUALIFICATION(*(CREW_QUALIFICATION*)csvCrewCertificateList[i]));
			crew->qualificationListInDb.push_back(copyInDb);
		}
		dbg = "CrewLicense";
		for (i = 0; i < csvCrewLicenseList.size(); i++) {
			shared_ptr<CREW_QUALIFICATION> copy(new CREW_QUALIFICATION(*(CREW_QUALIFICATION*)csvCrewLicenseList[i]));
			if (dto.addOrupdateCrewIdMap.find(copy->idCrew) == dto.addOrupdateCrewIdMap.end()) {
				Logger::getRuleLogger()->error("[loadDataUpdateCrew] ERROR: invalid crew_license data, crew={} not found", copy->idCrew);
				continue;
			}
			shared_ptr<CREW> crew = dto.addOrupdateCrewIdMap[copy->idCrew];
			crew->qualificationList.push_back(copy);

			string combQuals = filterQualsByCombsRules();
			if (combQuals.find(copy->qual) != std::string::npos) {
				crew->qualListFiltedByRules[copy->qual] = copy;
			}

			shared_ptr<CREW_QUALIFICATION> copyInDb(new CREW_QUALIFICATION(*(CREW_QUALIFICATION*)csvCrewLicenseList[i]));
			crew->qualificationListInDb.push_back(copyInDb);
		}
		dbg = "CrewLanguage";
		for (i = 0; i < csvCrewLanguageList.size(); i++) {
			shared_ptr<CREW_QUALIFICATION> copy(new CREW_QUALIFICATION(*(CREW_QUALIFICATION*)csvCrewLanguageList[i]));
			if (dto.addOrupdateCrewIdMap.find(copy->idCrew) == dto.addOrupdateCrewIdMap.end()) {
				Logger::getRuleLogger()->error("[loadDataUpdateCrew] ERROR: invalid crew_language data, crew={} not found", copy->idCrew);
				continue;
			}
			shared_ptr<CREW> crew = dto.addOrupdateCrewIdMap[copy->idCrew];
			crew->qualificationList.push_back(copy);

			string combQuals = filterQualsByCombsRules();
			if (combQuals.find(copy->qual) != std::string::npos) {
				crew->qualListFiltedByRules[copy->qual] = copy;
			}

			shared_ptr<CREW_QUALIFICATION> copyInDb(new CREW_QUALIFICATION(*(CREW_QUALIFICATION*)csvCrewLanguageList[i]));
			crew->qualificationListInDb.push_back(copyInDb);
		}
		dbg = "CrewGuaranteeHour";
		for (i = 0; i < csvCrewGuaranteeHourList.size(); i++) {
			shared_ptr<CREW_GUARANTEE_HOUR> copy(new CREW_GUARANTEE_HOUR(*(CREW_GUARANTEE_HOUR*)csvCrewGuaranteeHourList[i]));
			if (dto.addOrupdateCrewIdMap.find(copy->idCrew) == dto.addOrupdateCrewIdMap.end()) {
				Logger::getRuleLogger()->error("[loadDataUpdateCrew] ERROR: invalid crew_guarantee_hour data, crew={} not found", copy->idCrew);
				continue;
			}
			shared_ptr<CREW> crew = dto.addOrupdateCrewIdMap[copy->idCrew];
			crew->guaranteeHourList.push_back(copy);
		}
		dbg = "CrewFirstDutyInfo";
		for (i = 0; i < csvCrewFirstDutyInfoList.size(); i++) {
			shared_ptr<CREW_FIRST_DUTY_INFO> copy(new CREW_FIRST_DUTY_INFO(*(CREW_FIRST_DUTY_INFO*)csvCrewFirstDutyInfoList[i]));
			if (dto.addOrupdateCrewIdMap.find(copy->crewId) == dto.addOrupdateCrewIdMap.end()) {
				Logger::getRuleLogger()->error("[loadDataUpdateCrew] ERROR: invalid crew_first_duty_info data, crew={} not found", copy->crewId);
				continue;
			}
			shared_ptr<CREW> crew = dto.addOrupdateCrewIdMap[copy->crewId];
			crew->crewFirstDutyInfo = copy;
		}
		dbg = "CrewId";
		for (i = 0; i < csvCrewIdList.size(); i++) {
			string crewId = (*(string*)csvCrewIdList[i]);
			dto.delCrewIds.push_back(crewId);
		}
		//make avgAnnGuaranteeHourMap
		for (auto it = this->crewIdMap.begin(); it != this->crewIdMap.end(); it++) {
			if (it->second != nullptr) {
				it->second->makeAvgAnnGuaranteeHour();
				it->second->makeRosterValidity();
			}
		}
	}
	catch (exception& e) {
		Logger::getRuleLogger()->error("[loadDataUpdateCrew] ERROR: loadDataCsv failed {}, dbg={} i={}", e.what(), dbg, i);
		errorCode = -1;
	}

	return errorCode;

}
#define DEFAULT_REST_HOURS 10
int CrewDataContext::loadRosterCsv(const char * filepath, vector<shared_ptr<ROSTER>>& result) {
	int errorCode = 0;
	std::size_t i = 0;
	std::size_t j = 0;
	string dbg = "";
	ofstream errLog;
	DataCheck dataChecker;
	try {
		Logger::getRuleLogger()->info("loadDataCsv start");
		errLog.open("err.log");

		//read csv
		dbg = "reader.readMutiTableCsv";
		crewCsvReader reader;
		reader.readMutiTableCsv(filepath);
		Logger::getRuleLogger()->debug("read csv split_cost={} ms", (split_cost / 1000000));

		dbg = "Roster";
		{
			map<string, long long> errorRosterCrewMap;
			vector<void*> &csvRosterList = reader.datas["Roster"];
			for (i = 0; i < csvRosterList.size(); i++) {
				shared_ptr<ROSTER> copy = shared_ptr<ROSTER>(new ROSTER(*(ROSTER*)csvRosterList[i]));
				result.push_back(copy);
			}
			//ROSTER数量最多，提前释放
			ClearCsvReaderData(ROSTER, csvRosterList);
			Logger::getRuleLogger()->debug("After load Roster mem={}  MB", (getProcessCurrentMem() / (1024 * 1024)));
		}

		dbg = "RosterFlight";
		{
			map<long long, vector<SharedPtr<RosterFlight>>> rosterFlightMap = this->mergeRosterFlight;
			vector<void*> &csvRosterFlightList = reader.datas["RosterFlight"];
			for (i = 0; i < csvRosterFlightList.size(); i++) {
				SharedPtr<RosterFlight> rf((RosterFlight*)csvRosterFlightList[i]);
				vector<SharedPtr<RosterFlight>> list;
				if (rosterFlightMap.find(rf->rosterId) != rosterFlightMap.end()) {
					list = rosterFlightMap[rf->rosterId];
				}
				list.push_back(rf);
				rosterFlightMap[rf->rosterId] = list;
			}
			csvRosterFlightList.clear();
			this->mergeRosterFlight = rosterFlightMap;
			//std::cout << "After load RosterFlight mem=" << (getProcessCurrentMem() / (1024 * 1024)) << " MB" << endl;
		}

		dbg = "RosterGround";
		{
			map<string, long long> errorRosterCrewMap;
			vector<void*> &csvRosterGroundList = reader.datas["RosterGround"];
			for (i = 0; i < csvRosterGroundList.size(); i++) {
				shared_ptr<ROSTER> roster = shared_ptr<ROSTER>(new ROSTER(*(ROSTER*)csvRosterGroundList[i]));
				if (roster->source == "PA")
					continue;
				if (this->version == 2) {
					roster->endUtc = roster->restStrUtc + DEFAULT_REST_HOURS * 3600;
					roster->actEndUtc = roster->actRestStrUtc + DEFAULT_REST_HOURS * 3600;
				}

				//2023.06.25 防止rosterGround中restEndUtc字段为空，增加防护措施
				if (roster->endUtc == -1 && roster->actEndUtc == -1) {
					roster->endUtc = roster->restStrUtc;
					roster->actEndUtc = roster->actRestStrUtc;
				}

				//utc + timezone --> loc
				const auto& zoneId = this->airportZoneIdMap[roster->location];
				int timezoneOffsetMinutes = TimezoneUtils::GetTimezoneOffset(roster->actStrUtc, zoneId);
				roster->actStrLoc = roster->actStrUtc + 60 * timezoneOffsetMinutes;
				roster->actRestStrLoc = roster->actRestStrUtc + 60 * timezoneOffsetMinutes;
				roster->actEndLoc = roster->actEndUtc + 60 * timezoneOffsetMinutes;

				//act_loc --> sch_loc
				roster->strLoc = roster->actStrLoc;
				roster->restStrLoc = roster->actRestStrLoc;
				roster->endLoc = roster->actEndLoc;
				result.push_back(roster);
			}
			csvRosterGroundList.clear();
			Logger::getRuleLogger()->debug("After load RosterGround mem={} MB", (getProcessCurrentMem() / (1024 * 1024)));
		}
	}
	catch (bad_alloc& ) {
		Logger::getRuleLogger()->error("ERROR: loadDataCsv failed bad alloc, dbg={} i={} mem={} MB", dbg, i, (getProcessCurrentMem() / (1024 * 1024)));
	}
	catch (char* e) {
		Logger::getRuleLogger()->error("ERROR: loadDataCsv failed {}, dbg={} i={}", e, dbg, i);
	}
	catch (string e) {
		Logger::getRuleLogger()->error("ERROR: loadDataCsv failed {}, dbg={} i={}", e, dbg, i);
	}
	catch (exception& e) {
		Logger::getRuleLogger()->error("ERROR: loadDataCsv failed {}, dbg={} i={}", e.what(), dbg, i);
	}
	catch (...) {
		Logger::getRuleLogger()->error("ERROR: loadDataCsv failed unknown, dbg={} i={}", dbg, i);
	}
	if (errLog.is_open())
		errLog.close();
	return errorCode;
}

int CrewDataContext::loadDataCsv(const char * filepath) {
	int errorCode = 0;
	size_t i = 0;
	size_t j = 0;
	string dbg = "";
	ofstream errLog;
	DataCheck dataChecker;
	bool success = false;
	try {
		Logger::getRuleLogger()->info("loadDataCsv start");
		errLog.open("err.log");

		//read csv
		dbg = "reader.readMutiTableCsv";
		crewCsvReader reader;
		reader.readMutiTableCsv(filepath);
		this->version = reader.getVersion();
		Logger::getRuleLogger()->debug("read csv split_cost={} ms, version {}", (split_cost / 1000000), this->version);
		dbg = "systemParameter";
		//dataCtx.systemParameters
		vector<void*> csvSysParmList = reader.datas["SystemParameter"];
		for (i = 0; i < csvSysParmList.size(); i++) {
			csvSystemParam* obj = (csvSystemParam*)csvSysParmList[i];
			this->systemParamMap[string(obj->parmName)] = string(obj->parmValue);
		}
		//** 注 **
		//将 csv读取对象整理后放入 dbData
		//因 csvReader中内容需要被释放，不允许将 csvReader中原始对象加入 dbData，只能拷贝复制
		dbg = "qualification/base/rank/fleet/airport/rankActing";

		//qualification
		vector<void*>& qualificationList = reader.datas["Qualification"];
		for (i = 0; i < qualificationList.size(); i++) {
			QUALIFICATION qualification = (*(QUALIFICATION*)qualificationList[i]);
			this->qualificationList.push_back(qualification);
			this->qualificationMap.insert(pair<string, QUALIFICATION>(qualification.qualification, qualification));
		}
		//base
		vector<void*>& csvBaseList = reader.datas["Base"];
		map<long long, BASE> baseObjMap;
		for (i = 0; i < csvBaseList.size(); i++) {
			BASE base = (*(BASE*)csvBaseList[i]);
			baseObjMap[base.baseId] = base;
			this->baseList.push_back(base);//20180730 ain
		}
		//rank
		vector<void*>& rankList = reader.datas["Rank"];
		map<long long, string> rankIdMap;
		map<long long, RANK> rankObjMap;
		for (i = 0; i < rankList.size(); i++) {
			RANK rank = (*(RANK*)rankList[i]);
			this->rankList.push_back(rank);
			this->rankMap.insert(pair<string, RANK>(rank.rank, rank));
			rankIdMap[rank.rankId] = rank.rank;
			rankObjMap[rank.rankId] = rank;
		}
		//rank potision
		vector<void*>& rankPositionList = reader.datas["RankPosition"];
		for (i = 0; i < rankPositionList.size(); i++) {
			RANK_POSITION rankPosition = (*(RANK_POSITION*)rankPositionList[i]);
			string rank = rankIdMap[rankPosition.rankId];
			if (rank == ""){
				errLog << "ERROR: invalid rank——position data, rank=" << rank << ", posotion=" << rankPosition.position << ", not found" << endl;
				continue;
			}
			this->rankToPositionMap[rank].insert(rankPosition.position);
		}
		//team
		vector<void*>& teamList = reader.datas["Team"];
		map<long long, Team> teamObjMap;
		for (i = 0; i < teamList.size(); i++) {
			Team team = (*(Team*)teamList[i]);
			this->teamList.push_back(team);
			teamObjMap[team.id] = team;
		}
		//fleet
		vector<void*>& fleetList = reader.datas["Fleet"];
		map<long long, string> fleetIdMap;
		map<long long, FLEET> fleetObjMap;
		for (i = 0; i < fleetList.size(); i++) {
			FLEET fleet = (*(FLEET*)fleetList[i]);
			fleetIdMap[fleet.fleetId] = fleet.fleet;
			fleetObjMap[fleet.fleetId] = fleet;
			this->fleetList.push_back(fleet);
			this->fleetMap.insert(pair<string, FLEET>(fleet.fleet, fleet));
		}
		//sub fleet
		vector<void*>& subFleetList = reader.datas["SubFleet"];
		for (i = 0; i < subFleetList.size(); i++) {
			SUB_FLEET subFleet = (*(SUB_FLEET*)subFleetList[i]);
			this->subFleetList.push_back(subFleet);
			this->subFleetMap.insert(pair<string, SUB_FLEET>(subFleet.subFleet, subFleet));
		}
		//dictionary
		dbg = "dictionary";
		{
			vector<void*>& csvDictionaryList = reader.datas["Dictionary"];
			for (i = 0; i < csvDictionaryList.size(); i++) {
				Dictionary dictionary = (*(Dictionary*)csvDictionaryList[i]);
				this->dictionaryList.push_back(std::make_shared<Dictionary>(dictionary));
			}
			makeDictionaryMap();
		}
		//airport
		vector<void*>& csvAirportList = reader.datas["Airport"];
		for (i = 0; i < csvAirportList.size(); i++) {
			DBAirport* item = (DBAirport*)csvAirportList[i];
			DBAirport copy(*item);
			this->airportList.push_back(copy);
		}
		for (i = 0; i < this->airportList.size(); i++) {
			//airportCodeMap
			string airportCode = airportList[i].airport;
			this->airportCodeMap[airportCode] = &airportList[i];
			//airpot utc offset
			this->airportUtcOffsetMap[airportCode] = airportList[i].utcOffsetMinutes;
			this->airportZoneIdMap[airportCode] = airportList[i].zoneId;
		}
		//city
		map<string, string> airportCountryMap;
		vector<void*>& csvCityList = reader.datas["City"];
		for (i = 0; i < csvCityList.size(); i++) {
			csvCity * city = (csvCity*)csvCityList[i];
			airportCountryMap[city->city] = city->country;
		}
		for (i = 0; i < this->airportList.size(); i++) {
			string airportName = this->airportList[i].city;//20180316 ain, mantis#2968, find city.country by airport.city=city.city
			auto iterCountry = airportCountryMap.find(airportName);
			if (iterCountry != airportCountryMap.end()) {
				string country = iterCountry->second;
				strncpy(airportList[i].country, country.c_str(), sizeof(airportList[i].country));
			}
		}
		//rankActing
		vector<void*>& csvRankActingList = reader.datas["RankActing"];
		for (i = 0; i < csvRankActingList.size(); i++) {
			DBRankActing item;
			csvRankActing * csvData = (csvRankActing*)csvRankActingList[i];
			item.tid = csvData->id;
			item.airline = csvData->airline;
			item.activeRank = csvData->activeRank;
			item.actingRank = csvData->actingRank;
			item.qual = csvData->qual;
			this->rankActingList.push_back(item);
		}
		//briefing
		vector<void*> csvBriefList = reader.datas["Briefing"];
		for (i = 0; i < csvBriefList.size(); i++) {
			SharedPtr<Briefing> item(new Briefing(*((Briefing*)csvBriefList[i])));
			this->briefingNameMap[item->airline + item->airport] = item;
		}

		vector<void*> csvRouteRadiationConfigList = reader.datas["RouteRadiationConfig"];
		for (i = 0; i < csvRouteRadiationConfigList.size(); i++) {
			RouteRadiationConfig item = (*(RouteRadiationConfig*)csvRouteRadiationConfigList[i]);
			this->routeRadiationConfigList.push_back(item);
		}

		dbg = "composition/composition_rank";
		//composition/ composition_rank
		map<long long, shared_ptr<map<string, int>>> compositionRankValueMap;
		loadCompositionRank(compositionRankValueMap, rankIdMap, reader, this);

		dbg = "CompositionLoad";
		loadCompositionLoad(this, reader);

		dbg = "CalculationManday";
		vector<void*> csvCalculationManday = reader.datas["CalculationManday"];
		for (i = 0; i < csvCalculationManday.size(); i++) {
			CalculationManday* obj = (CalculationManday*)csvCalculationManday[i];
			this->addCalculationManday(obj->type, (*obj));
		}

		dbg = "assignment/ rule_8014";
		loadAssignmentAndGroup(this, reader);

		dbg = "Attribute";
		map<long long, ATTRIBUTE*> tmpAttrMap; //临时数据, 内容跟随随reader释放
		{
			vector<void*> csvList = reader.datas["Attribute"];
			for (i = 0; i < csvList.size(); i++) {
				//ATTRIBUTE* item = (ATTRIBUTE*)csvList[i];
				csvAttribute* obj = (csvAttribute*)csvList[i];
				ATTRIBUTE item;
				item.id = obj->id;
				item.airline = obj->airline;
				item.code = obj->code;
				item.type = obj->type;
				item.operation = obj->operation;
				item.source = obj->source;
				this->attributeIdMap[item.id] = item;
				tmpAttrMap[item.id] = &attributeIdMap[item.id];

				// mantis#6661
				if (obj->code.length() > 0 && obj->name.length() > 0)
				{
					attributeNameMap.insert(std::make_pair(obj->code, obj->name));
				}
			}
		}
		dbg = "Tag";
		map<long long, SharedPtr<TAG_CATEGORY>> tmpTagMap; //临时数据, 内容跟随随reader释放
		{
			vector<void*> csvTagCategorys = reader.datas["TagCategory"];
			vector<void*> csvTagGroups = reader.datas["TagGroup"];
			vector<void*> csvTagFlights = reader.datas["TagFlight"];
			vector<void*> csvTagDutys = reader.datas["TagDuty"];
			vector<void*> csvTagPairings = reader.datas["TagPairing"];
			vector<void*> csvTagFlightCompositions = reader.datas["TagFlightComposition"];
			vector<void*> csvTagRosterGround = reader.datas["TagRosterGround"];

			for (std::size_t i = 0; i < csvTagCategorys.size(); i++) {
				SharedPtr<TAG_CATEGORY> item(new TAG_CATEGORY(*((TAG_CATEGORY*)csvTagCategorys[i])));
				
				this->tagCategoryList.push_back(item);
				tmpTagMap[item->id] = item;
			}
			for (std::size_t i = 0; i < csvTagGroups.size(); i++) {
				SharedPtr<TAG_GROUP> item(new TAG_GROUP(*((TAG_GROUP*)csvTagGroups[i])));
				if (item->type == "TABLE") {
					this->tagGroupTableMap[item->parentId].push_back(item);
					continue;
				}
				if (item->parentId == 0) {
					//SharedPtr<TAG> tag;
					TAG * tag = new TAG;
					tag->id = item->id;
					tag->condition = item->condition;
					tag->tagCategoryId = item->tagCategoryId;
					tag->type = item->type;
					tag->idx = item->idx;
					tag->level = item->level;
					tag->parentId = llToStr(item->parentId);
					this->tagGroupMap[tag->id] = tag;
					continue;
				}
				if (this->tagGroupMap.find(item->parentId) != this->tagGroupMap.end()) {
					this->tagGroupMap[item->parentId]->groups.push_back(item);
				}
				
			}
			for (std::size_t i = 0; i < csvTagFlights.size(); i++) {
				SharedPtr<TAG_FLIGHT> item(new TAG_FLIGHT(*((TAG_FLIGHT*)csvTagFlights[i])));
				
				this->tagFlightGroupMap[item->tagGroupId].push_back(item);
			}
			for (std::size_t i = 0; i < csvTagDutys.size(); i++) {
				SharedPtr<TAG_DUTY> item(new TAG_DUTY(*((TAG_DUTY*)csvTagDutys[i])));

				this->tagDutyGroupMap[item->tagGroupId].push_back(item);
			}
			for (std::size_t i = 0; i < csvTagPairings.size(); i++) {
				SharedPtr<TAG_PAIRING> item(new TAG_PAIRING(*((TAG_PAIRING*)csvTagPairings[i])));

				this->tagPairingGroupMap[item->tagGroupId].push_back(item);
			}
			for (std::size_t i = 0; i < csvTagFlightCompositions.size(); i++) {
				SharedPtr<TAG_FLIGHT_COMPOSITION> item(new TAG_FLIGHT_COMPOSITION(*((TAG_FLIGHT_COMPOSITION*)csvTagFlightCompositions[i])));

				this->tagFlightCompositionGroupMap[item->tagGroupId].push_back(item);
			}
			for (std::size_t i = 0; i < csvTagRosterGround.size(); i++) {
				SharedPtr<TAG_ROSTER_GROUND> item(new TAG_ROSTER_GROUND(*((TAG_ROSTER_GROUND*)csvTagRosterGround[i])));

				this->tagRosterGroundGroupMap[item->tagGroupId].push_back(item);
			}
		}
		dbg = "TagSuperCategory";
		vector<void*> csvTagSuperCategoryList = reader.datas["TagSuperCategory"];
		for (i = 0; i < csvTagSuperCategoryList.size(); i++) {
			TAG_SUPER_CATEGORY* obj = (TAG_SUPER_CATEGORY*)csvTagSuperCategoryList[i];
			this->tagSuperCategoryList.push_back(shared_ptr<TAG_SUPER_CATEGORY>(new TAG_SUPER_CATEGORY(*(TAG_SUPER_CATEGORY*)obj)));
		}
		dbg = "TagSuperCategoryMap";
		vector<void*> csvTagSuperCategoryMapList = reader.datas["TagSuperCategoryMap"];
		for (i = 0; i < csvTagSuperCategoryMapList.size(); i++) {
			TAG_SUPER_CATEGORY_MAP* obj = (TAG_SUPER_CATEGORY_MAP*)csvTagSuperCategoryMapList[i];
			this->tagSuperCategoryMapList.push_back(shared_ptr<TAG_SUPER_CATEGORY_MAP>(new TAG_SUPER_CATEGORY_MAP(*(TAG_SUPER_CATEGORY_MAP*)obj)));
		}

		//TmTrainingConfig
		dbg = "TmTrainingConfig";
		{
			vector<void*>& csvTmTrainingConfigList = reader.datas["TmTrainingConfig"];
			for (i = 0; i < csvTmTrainingConfigList.size(); i++) {
				std::shared_ptr<TmTrainingConfig> tmTrainingConfig = std::make_shared<TmTrainingConfig>((*(TmTrainingConfig*)csvTmTrainingConfigList[i]));
				this->tmTrainingConfigList.emplace_back(tmTrainingConfig);
			}
			this->tmTrainingConfigIndex = std::make_shared<TmTrainingConfigIndex>(this->tmTrainingConfigList);
		}

		//tmCourse
		dbg = "tmCourse";
		{
			vector<void*>& csvTmCourseList = reader.datas["TmCourse"];
			for (i = 0; i < csvTmCourseList.size(); i++) {
				std::shared_ptr<TmCourse> tmCourse = std::make_shared<TmCourse>((*(TmCourse*)csvTmCourseList[i]));
				this->tmCourseList.push_back(tmCourse);
				this->tmCourseMap.insert(make_pair(tmCourse->id, tmCourse));
				this->tmCourseCodeMap.insert(make_pair(tmCourse->courseCode, tmCourse));
			}
		}

		//TmCourseBrief
		dbg = "TmCourseBrief";
		{
			vector<void*>& csvTmCourseBriefList = reader.datas["TmCourseBrief"];
			for (i = 0; i < csvTmCourseBriefList.size(); i++) {
				std::shared_ptr<TmCourseBrief> tmCourseBrief = std::make_shared<TmCourseBrief>((*(TmCourseBrief*)csvTmCourseBriefList[i]));
				this->tmCourseBriefList.emplace_back(tmCourseBrief);
			}
			this->tmCourseBriefIndex = std::make_shared<TmCourseBriefIndex>(this->tmCourseBriefList);
		}

		//TmCourseDuration
		dbg = "TmCourseDuration";
		{
			vector<void*>& csvTmCourseDurationList = reader.datas["TmCourseDuration"];
			for (i = 0; i < csvTmCourseDurationList.size(); i++) {
				std::shared_ptr<TmCourseDuration> tmCourseDuration = std::make_shared<TmCourseDuration>((*(TmCourseDuration*)csvTmCourseDurationList[i]));
				this->tmCourseDurationList.emplace_back(tmCourseDuration);
			}
			this->tmCourseDurationIndex = std::make_shared<TmCourseDurationIndex>(this->tmCourseDurationList);
		}

		//TmCourseRole
		dbg = "TmCourseRole";
		{
			vector<void*>& csvTmCourseRoleList = reader.datas["TmCourseRole"];
			for (i = 0; i < csvTmCourseRoleList.size(); i++) {
				std::shared_ptr<TmCourseRole> tmCourseRole = std::make_shared<TmCourseRole>((*(TmCourseRole*)csvTmCourseRoleList[i]));
				this->tmCourseRoleList.emplace_back(tmCourseRole);
			}
		}
		this->tmCourseRoleIndex = std::make_shared<TmCourseRoleIndex>(this->tmCourseRoleList);

		//TmCourseRoleBase
		dbg = "TmCourseRoleBase";
		{
			vector<void*>& csvTmCourseRoleBaseList = reader.datas["TmCourseRoleBase"];
			for (i = 0; i < csvTmCourseRoleBaseList.size(); i++) {
				std::shared_ptr<TmCourseRoleBase> tmCourseRoleBase = std::make_shared<TmCourseRoleBase>((*(TmCourseRoleBase*)csvTmCourseRoleBaseList[i]));
				this->tmCourseRoleBaseList.emplace_back(tmCourseRoleBase);
			}
			this->tmCourseRoleBaseIndex = std::make_shared<TmCourseRoleBaseIndex>(this->tmCourseRoleBaseList);
		}

		//TmCourseRoleQual
		dbg = "TmCourseRoleQual";
		{
			vector<void*>& csvTmCourseRoleQualList = reader.datas["TmCourseRoleQual"];
			for (i = 0; i < csvTmCourseRoleQualList.size(); i++) {
				std::shared_ptr<TmCourseRoleQual> tmCourseRoleQual = std::make_shared<TmCourseRoleQual>((*(TmCourseRoleQual*)csvTmCourseRoleQualList[i]));
				this->tmCourseRoleQualList.emplace_back(tmCourseRoleQual);
			}
			this->tmCourseRoleQualIndex = std::make_shared<TmCourseRoleQualIndex>(this->tmCourseRoleQualList);
		}

		//TmCourseRoleDevice
		dbg = "TmCourseRoleDevice";
		{
			vector<void*>& csvTmCourseRoleDeviceList = reader.datas["TmCourseRoleDevice"];
			for (i = 0; i < csvTmCourseRoleDeviceList.size(); i++) {
				std::shared_ptr<TmCourseRoleDevice> tmCourseRoleDevice = std::make_shared<TmCourseRoleDevice>((*(TmCourseRoleDevice*)csvTmCourseRoleDeviceList[i]));
				this->tmCourseRoleDeviceList.emplace_back(tmCourseRoleDevice);
			}
			this->tmCourseRoleDeviceIndex = std::make_shared<TmCourseRoleDeviceIndex>(this->tmCourseRoleDeviceList);
		}

		//TmFootprint
		dbg = "TmFootprint";
		{
			vector<void*>& csvTmFootprintList = reader.datas["TmFootprint"];
			for (i = 0; i < csvTmFootprintList.size(); i++) {
				std::shared_ptr<TmFootprint> tmFootprint = std::make_shared<TmFootprint>((*(TmFootprint*)csvTmFootprintList[i]));
				this->tmFootprintList.emplace_back(tmFootprint);
			}
			this->tmFootprintIndex = std::make_shared<TmFootprintIndex>(this->tmFootprintList);
		}

		//TmFootprintCourse
		dbg = "TmFootprintCourse";
		{
			vector<void*>& csvTmFootprintCourseList = reader.datas["TmFootprintCourse"];
			for (i = 0; i < csvTmFootprintCourseList.size(); i++) {
				std::shared_ptr<TmFootprintCourse> tmFootprintCourse = std::make_shared<TmFootprintCourse>((*(TmFootprintCourse*)csvTmFootprintCourseList[i]));
				this->tmFootprintCourseList.emplace_back(tmFootprintCourse);
			}
			this->tmFootprintCourseIndex = std::make_shared<TmFootprintCourseIndex>(this->tmFootprintCourseList);
		}

		//TmFootprintCourseTrainee
		dbg = "TmFootprintCourseTrainee";
		{
			vector<void*>& csvTmFootprintCourseTraineeList = reader.datas["TmFootprintCourseTrainee"];
			for (i = 0; i < csvTmFootprintCourseTraineeList.size(); i++) {
				std::shared_ptr<TmFootprintCourseTrainee> tmFootprintCourseTrainee = std::make_shared<TmFootprintCourseTrainee>((*(TmFootprintCourseTrainee*)csvTmFootprintCourseTraineeList[i]));
				this->tmFootprintCourseTraineeList.emplace_back(tmFootprintCourseTrainee);
			}
			this->tmFootprintCourseTraineeIndex = std::make_shared<TmFootprintCourseTraineeIndex>(this->tmFootprintCourseTraineeList);
		}

		//TmFootprintCourseSector
		dbg = "TmFootprintCourseSector";
		{
			vector<void*>& csvTmFootprintCourseSectorList = reader.datas["TmFootprintCourseSector"];
			for (i = 0; i < csvTmFootprintCourseSectorList.size(); i++) {
				std::shared_ptr<TmFootprintCourseSector> tmFootprintCourseSector = std::make_shared<TmFootprintCourseSector>((*(TmFootprintCourseSector*)csvTmFootprintCourseSectorList[i]));
				this->tmFootprintCourseSectorList.emplace_back(tmFootprintCourseSector);
			}
			this->tmFootprintCourseSectorIndex = std::make_shared<TmFootprintCourseSectorIndex>(this->tmFootprintCourseSectorList);
		}

		//TmFootprintCourseIpRole
		dbg = "TmFootprintCourseIpRole";
		{
			vector<void*>& csvTmFootprintCourseIpRoleList = reader.datas["TmFootprintCourseIpRole"];
			for (i = 0; i < csvTmFootprintCourseIpRoleList.size(); i++) {
				std::shared_ptr<TmFootprintCourseIpRole> tmFootprintCourseIpRole = std::make_shared<TmFootprintCourseIpRole>((*(TmFootprintCourseIpRole*)csvTmFootprintCourseIpRoleList[i]));
				this->tmFootprintCourseIpRoleList.emplace_back(tmFootprintCourseIpRole);
			}
			this->tmFootprintCourseIpRoleIndex = std::make_shared<TmFootprintCourseIpRoleIndex>(this->tmFootprintCourseIpRoleList);
		}

		//TmFootprintCourseIpRoleBase
		dbg = "TmFootprintCourseIpRoleBase";
		{
			vector<void*>& csvTmFootprintCourseIpRoleBaseList = reader.datas["TmFootprintCourseIpRoleBase"];
			for (i = 0; i < csvTmFootprintCourseIpRoleBaseList.size(); i++) {
				std::shared_ptr<TmFootprintCourseIpRoleBase> tmFootprintCourseIpRoleBase = std::make_shared<TmFootprintCourseIpRoleBase>((*(TmFootprintCourseIpRoleBase*)csvTmFootprintCourseIpRoleBaseList[i]));
				this->tmFootprintCourseIpRoleBaseList.emplace_back(tmFootprintCourseIpRoleBase);
			}
			this->tmFootprintCourseIpRoleBaseIndex = std::make_shared<TmFootprintCourseIpRoleBaseIndex>(this->tmFootprintCourseIpRoleBaseList);
		}

		//TmFootprintCourseIpRoleQual
		dbg = "TmFootprintCourseIpRoleQual";
		{
			vector<void*>& csvTmFootprintCourseIpRoleQualList = reader.datas["TmFootprintCourseIpRoleQual"];
			for (i = 0; i < csvTmFootprintCourseIpRoleQualList.size(); i++) {
				std::shared_ptr<TmFootprintCourseIpRoleQual> tmFootprintCourseIpRoleQual = std::make_shared<TmFootprintCourseIpRoleQual>((*(TmFootprintCourseIpRoleQual*)csvTmFootprintCourseIpRoleQualList[i]));
				this->tmFootprintCourseIpRoleQualList.emplace_back(tmFootprintCourseIpRoleQual);
			}
			this->tmFootprintCourseIpRoleQualIndex = std::make_shared<TmFootprintCourseIpRoleQualIndex>(this->tmFootprintCourseIpRoleQualList);
		}

		//TmFootprintCourseRole
		dbg = "TmFootprintCourseRole";
		{
			vector<void*>& csvTmFootprintCourseRoleList = reader.datas["TmFootprintCourseRole"];
			for (i = 0; i < csvTmFootprintCourseRoleList.size(); i++) {
				std::shared_ptr<TmFootprintCourseRole> tmFootprintCourseRole = std::make_shared<TmFootprintCourseRole>((*(TmFootprintCourseRole*)csvTmFootprintCourseRoleList[i]));
				this->tmFootprintCourseRoleList.emplace_back(tmFootprintCourseRole);
			}
			this->tmFootprintCourseRoleIndex = std::make_shared<TmFootprintCourseRoleIndex>(this->tmFootprintCourseRoleList);
		}

		//TmFootprintCourseRoleQual
		dbg = "TmFootprintCourseRoleQual";
		{
			vector<void*>& csvTmFootprintCourseRoleQualList = reader.datas["TmFootprintCourseRoleQual"];
			for (i = 0; i < csvTmFootprintCourseRoleQualList.size(); i++) {
				std::shared_ptr<TmFootprintCourseRoleQual> tmFootprintCourseRoleQual = std::make_shared<TmFootprintCourseRoleQual>((*(TmFootprintCourseRoleQual*)csvTmFootprintCourseRoleQualList[i]));
				this->tmFootprintCourseRoleQualList.emplace_back(tmFootprintCourseRoleQual);
			}
			this->tmFootprintCourseRoleQualIndex = std::make_shared<TmFootprintCourseRoleQualIndex>(this->tmFootprintCourseRoleQualList);
		}

		//TmFootprintCourseRoleLimitation
		dbg = "TmFootprintCourseRoleLimitation";
		{
			vector<void*>& csvTmFootprintCourseRoleLimitationList = reader.datas["TmFootprintCourseRoleLimitation"];
			for (i = 0; i < csvTmFootprintCourseRoleLimitationList.size(); i++) {
				std::shared_ptr<TmFootprintCourseRoleLimitation> tmFootprintCourseRoleLimitation = std::make_shared<TmFootprintCourseRoleLimitation>((*(TmFootprintCourseRoleLimitation*)csvTmFootprintCourseRoleLimitationList[i]));
				this->tmFootprintCourseRoleLimitationList.emplace_back(tmFootprintCourseRoleLimitation);
			}
			this->tmFootprintCourseRoleLimitationIndex = std::make_shared<TmFootprintCourseRoleLimitationIndex>(this->tmFootprintCourseRoleLimitationList);
		}

		//TmProgram
		dbg = "TmProgram";
		{
			vector<void*>& csvTmProgramList = reader.datas["TmProgram"];
			for (i = 0; i < csvTmProgramList.size(); i++) {
				std::shared_ptr<TmProgram> tmProgram = std::make_shared<TmProgram>((*(TmProgram*)csvTmProgramList[i]));
				this->tmProgramList.emplace_back(tmProgram);
			}
			this->tmProgramIndex = std::make_shared<TmProgramIndex>(this->tmProgramList);
		}
		//TmProgramBuddy
		dbg = "TmProgramBuddy";
		{
			vector<void*>& csvTmProgramBuddyList = reader.datas["TmProgramBuddy"];
			for (i = 0; i < csvTmProgramBuddyList.size(); i++) {
				std::shared_ptr<TmProgramBuddy> tmProgramBuddy = std::make_shared<TmProgramBuddy>((*(TmProgramBuddy*)csvTmProgramBuddyList[i]));
				this->tmProgramBuddyList.emplace_back(tmProgramBuddy);
			}
			this->tmProgramBuddyIndex = std::make_shared<TmProgramBuddyIndex>(this->tmProgramBuddyList);
		}
		//TmProgramBuddyTime
		dbg = "TmProgramBuddyTime";
		{
			vector<void*>& csvTmProgramBuddyTimeList = reader.datas["TmProgramBuddyTime"];
			for (i = 0; i < csvTmProgramBuddyTimeList.size(); i++) {
				std::shared_ptr<TmProgramBuddyTime> tmProgramBuddyTime = std::make_shared<TmProgramBuddyTime>((*(TmProgramBuddyTime*)csvTmProgramBuddyTimeList[i]));
				this->tmProgramBuddyTimeList.emplace_back(tmProgramBuddyTime);
			}
			this->tmProgramBuddyTimeIndex = std::make_shared<TmProgramBuddyTimeIndex>(this->tmProgramBuddyTimeList);
		}
		//TmProgramBuddyCourse
		dbg = "TmProgramBuddyCourse";
		{
			vector<void*>& csvTmProgramBuddyCourseList = reader.datas["TmProgramBuddyCourse"];
			for (i = 0; i < csvTmProgramBuddyCourseList.size(); i++) {
				std::shared_ptr<TmProgramBuddyCourse> tmProgramBuddyCourse = std::make_shared<TmProgramBuddyCourse>((*(TmProgramBuddyCourse*)csvTmProgramBuddyCourseList[i]));
				this->tmProgramBuddyCourseList.emplace_back(tmProgramBuddyCourse);
			}
			this->tmProgramBuddyCourseIndex = std::make_shared<TmProgramBuddyCourseIndex>(this->tmProgramBuddyCourseList);
		}

		//TmProgramPip
		dbg = "TmProgramPip";
		{
			vector<void*>& csvTmProgramPipList = reader.datas["TmProgramPip"];
			for (i = 0; i < csvTmProgramPipList.size(); i++) {
				std::shared_ptr<TmProgramPip> tmProgramPip = std::make_shared<TmProgramPip>((*(TmProgramPip*)csvTmProgramPipList[i]));
				this->tmProgramPipList.emplace_back(tmProgramPip);
			}
			this->tmProgramPipIndex = std::make_shared<TmProgramPipIndex>(this->tmProgramPipList);
		}
		
		//TmProgramCourse
		dbg = "TmProgramCourse";
		{
			vector<void*>& csvTmProgramCourseList = reader.datas["TmProgramCourse"];
			for (i = 0; i < csvTmProgramCourseList.size(); i++) {
				std::shared_ptr<TmProgramCourse> tmProgramCourse = std::make_shared<TmProgramCourse>((*(TmProgramCourse*)csvTmProgramCourseList[i]));
				this->tmProgramCourseMap.insert(std::make_pair(tmProgramCourse->id, tmProgramCourse));
			}
			this->tmProgramCourseIndex = std::make_shared<TmProgramCourseIndex>(this->tmProgramCourseMap);
		}
		
		//TmProgramCourseInstructor
		dbg = "TmProgramCourseInstructor";
		{
			vector<void*>& csvTmProgramCourseInstructorList = reader.datas["TmProgramCourseInstructor"];
			for (i = 0; i < csvTmProgramCourseInstructorList.size(); i++) {
				std::shared_ptr<TmProgramCourseInstructor> tmProgramCourseInstructor = std::make_shared<TmProgramCourseInstructor>((*(TmProgramCourseInstructor*)csvTmProgramCourseInstructorList[i]));
				this->tmProgramCourseInstructorMap.insert(std::make_pair(tmProgramCourseInstructor->id, tmProgramCourseInstructor));
			}
			this->tmProgramCourseInstructorIndex = std::make_shared<TmProgramCourseInstructorIndex>(this->tmProgramCourseInstructorMap);
		}

		//TmProgramCourseLimitation
		dbg = "TmProgramCourseLimitation";
		{
			vector<void*>& csvTmProgramCourseLimitationList = reader.datas["TmProgramCourseLimitation"];
			for (i = 0; i < csvTmProgramCourseLimitationList.size(); i++) {
				std::shared_ptr<TmProgramCourseLimitation> tmProgramCourseLimitation = std::make_shared<TmProgramCourseLimitation>((*(TmProgramCourseLimitation*)csvTmProgramCourseLimitationList[i]));
				this->tmProgramCourseLimitationList.emplace_back(tmProgramCourseLimitation);
			}
			this->tmProgramCourseLimitationIndex = std::make_shared<TmProgramCourseLimitationIndex>(this->tmProgramCourseLimitationList);
		}

		//TmProgramCourseIpRelevance
		dbg = "TmProgramCourseIpRelevance";
		{
			vector<void*>& csvTmProgramCourseIpRelevanceList = reader.datas["TmProgramCourseIpRelevance"];
			for (i = 0; i < csvTmProgramCourseIpRelevanceList.size(); i++) {
				std::shared_ptr<TmProgramCourseIpRelevance> tmProgramCourseIpRelevance = std::make_shared<TmProgramCourseIpRelevance>((*(TmProgramCourseIpRelevance*)csvTmProgramCourseIpRelevanceList[i]));
				this->tmProgramCourseIpRelevanceList.emplace_back(tmProgramCourseIpRelevance);
			}
			this->tmProgramCourseIpRelevanceIndex = std::make_shared<TmProgramCourseIpRelevanceIndex>(this->tmProgramCourseIpRelevanceList);
		}

		//TmProgramCourseRole
		dbg = "TmProgramCourseRole";
		{
			vector<void*>& csvTmProgramCourseRoleList = reader.datas["TmProgramCourseRole"];
			for (i = 0; i < csvTmProgramCourseRoleList.size(); i++) {
				std::shared_ptr<TmProgramCourseRole> tmProgramCourseRole = std::make_shared<TmProgramCourseRole>((*(TmProgramCourseRole*)csvTmProgramCourseRoleList[i]));
				this->tmProgramCourseRoleList.emplace_back(tmProgramCourseRole);
			}
			this->tmProgramCourseRoleIndex = std::make_shared<TmProgramCourseRoleIndex>(this->tmProgramCourseRoleList);
		}

		//TmProgramCourseRoleQual
		dbg = "TmProgramCourseRoleQual";
		{
			vector<void*>& csvTmProgramCourseRoleQualList = reader.datas["TmProgramCourseRoleQual"];
			for (i = 0; i < csvTmProgramCourseRoleQualList.size(); i++) {
				std::shared_ptr<TmProgramCourseRoleQual> tmProgramCourseRoleQual = std::make_shared<TmProgramCourseRoleQual>((*(TmProgramCourseRoleQual*)csvTmProgramCourseRoleQualList[i]));
				this->tmProgramCourseRoleQualList.emplace_back(tmProgramCourseRoleQual);
			}
			this->tmProgramCourseRoleQualIndex = std::make_shared<TmProgramCourseRoleQualIndex>(this->tmProgramCourseRoleQualList);
		}

		//TmProgramCourseRoleLimitation
		dbg = "TmProgramCourseRoleLimitation";
		{
			vector<void*>& csvTmProgramCourseRoleLimitationList = reader.datas["TmProgramCourseRoleLimitation"];
			for (i = 0; i < csvTmProgramCourseRoleLimitationList.size(); i++) {
				std::shared_ptr<TmProgramCourseRoleLimitation> tmProgramCourseRoleLimitation = std::make_shared<TmProgramCourseRoleLimitation>((*(TmProgramCourseRoleLimitation*)csvTmProgramCourseRoleLimitationList[i]));
				this->tmProgramCourseRoleLimitationList.emplace_back(tmProgramCourseRoleLimitation);
			}
			this->tmProgramCourseRoleLimitationIndex = std::make_shared<TmProgramCourseRoleLimitationIndex>(this->tmProgramCourseRoleLimitationList);
		}

		//TmProgramCourseIpRole
		dbg = "TmProgramCourseIpRole";
		{
			vector<void*>& csvTmProgramCourseIpRoleList = reader.datas["TmProgramCourseIpRole"];
			for (i = 0; i < csvTmProgramCourseIpRoleList.size(); i++) {
				std::shared_ptr<TmProgramCourseIpRole> tmProgramCourseIpRole = std::make_shared<TmProgramCourseIpRole>((*(TmProgramCourseIpRole*)csvTmProgramCourseIpRoleList[i]));
				this->tmProgramCourseIpRoleList.emplace_back(tmProgramCourseIpRole);
			}
			this->tmProgramCourseIpRoleIndex = std::make_shared<TmProgramCourseIpRoleIndex>(this->tmProgramCourseIpRoleList);
		}

		//TmProgramCourseIpRoleBase
		dbg = "TmProgramCourseIpRoleBase";
		{
			vector<void*>& csvTmProgramCourseIpRoleBaseList = reader.datas["TmProgramCourseIpRoleBase"];
			for (i = 0; i < csvTmProgramCourseIpRoleBaseList.size(); i++) {
				std::shared_ptr<TmProgramCourseIpRoleBase> tmProgramCourseIpRoleBase = std::make_shared<TmProgramCourseIpRoleBase>((*(TmProgramCourseIpRoleBase*)csvTmProgramCourseIpRoleBaseList[i]));
				this->tmProgramCourseIpRoleBaseList.emplace_back(tmProgramCourseIpRoleBase);
			}
			this->tmProgramCourseIpRoleBaseIndex = std::make_shared<TmProgramCourseIpRoleBaseIndex>(this->tmProgramCourseIpRoleBaseList);
		}

		//TmProgramCourseIpRoleQual
		dbg = "TmProgramCourseIpRoleQual";
		{
			vector<void*>& csvTmProgramCourseIpRoleQualList = reader.datas["TmProgramCourseIpRoleQual"];
			for (i = 0; i < csvTmProgramCourseIpRoleQualList.size(); i++) {
				std::shared_ptr<TmProgramCourseIpRoleQual> tmProgramCourseIpRoleQual = std::make_shared<TmProgramCourseIpRoleQual>((*(TmProgramCourseIpRoleQual*)csvTmProgramCourseIpRoleQualList[i]));
				this->tmProgramCourseIpRoleQualList.emplace_back(tmProgramCourseIpRoleQual);
			}
			this->tmProgramCourseIpRoleQualIndex = std::make_shared<TmProgramCourseIpRoleQualIndex>(this->tmProgramCourseIpRoleQualList);
		}

		//TmProgramCoursePnr
		dbg = "TmProgramCoursePnr";
		{
			vector<void*>& csvTmProgramCoursePnrList = reader.datas["TmProgramCoursePnr"];
			for (i = 0; i < csvTmProgramCoursePnrList.size(); i++) {
				std::shared_ptr<TmProgramCoursePnr> tmProgramCoursePnr = std::make_shared<TmProgramCoursePnr>((*(TmProgramCoursePnr*)csvTmProgramCoursePnrList[i]));
				this->tmProgramCoursePnrList.emplace_back(tmProgramCoursePnr);
			}
			this->tmProgramCoursePnrIndex = std::make_shared<TmProgramCoursePnrIndex>(this->tmProgramCoursePnrList);
		}

		//TmProgramCourseIpck
		dbg = "TmProgramCourseIpck";
		{
			vector<void*>& csvTmProgramCourseIpckList = reader.datas["TmProgramCourseIpck"];
			for (i = 0; i < csvTmProgramCourseIpckList.size(); i++) {
				std::shared_ptr<TmProgramCourseIpck> tmProgramCourseIpck = std::make_shared<TmProgramCourseIpck>((*(TmProgramCourseIpck*)csvTmProgramCourseIpckList[i]));
				this->tmProgramCourseIpckList.emplace_back(tmProgramCourseIpck);
			}
			this->tmProgramCourseIpckIndex = std::make_shared<TmProgramCourseIpckIndex>(this->tmProgramCourseIpckList);
		}

		//TmProgramCourseMore
		dbg = "TmProgramCourseMore";
		{
			vector<void*>& csvTmProgramCourseMoreList = reader.datas["TmProgramCourseMore"];
			for (i = 0; i < csvTmProgramCourseMoreList.size(); i++) {
				std::shared_ptr<TmProgramCourseMore> tmProgramCourseMore = std::make_shared<TmProgramCourseMore>((*(TmProgramCourseMore*)csvTmProgramCourseMoreList[i]));
				this->tmProgramCourseMoreList.emplace_back(tmProgramCourseMore);
			}
			this->tmProgramCourseMoreIndex = std::make_shared<TmProgramCourseMoreIndex>(this->tmProgramCourseMoreList);
		}

		//TmProgramCourseMoreLeg
		dbg = "TmProgramCourseMoreLeg";
		{
			vector<void*>& csvTmProgramCourseMoreLegList = reader.datas["TmProgramCourseMoreLeg"];
			for (i = 0; i < csvTmProgramCourseMoreLegList.size(); i++) {
				std::shared_ptr<TmProgramCourseMoreLeg> tmProgramCourseMoreLeg = std::make_shared<TmProgramCourseMoreLeg>((*(TmProgramCourseMoreLeg*)csvTmProgramCourseMoreLegList[i]));
				tmProgramCourseMoreLeg->makeAllLegStations(this);
				this->tmProgramCourseMoreLegList.emplace_back(tmProgramCourseMoreLeg);
			}
			this->tmProgramCourseMoreLegIndex = std::make_shared<TmProgramCourseMoreLegIndex>(this->tmProgramCourseMoreLegList);
		}

		//TmDevice
		dbg = "TmDevice";
		{
			vector<void*>& csvTmDeviceList = reader.datas["TmDevice"];
			for (i = 0; i < csvTmDeviceList.size(); i++) {
				std::shared_ptr<TmDevice> tmDevice = std::make_shared<TmDevice>((*(TmDevice*)csvTmDeviceList[i]));
				this->tmDeviceList.emplace_back(tmDevice);
			}
			this->tmDeviceMap.clear();
			for (auto& tmDevice : this->tmDeviceList) {
				this->tmDeviceMap.insert(make_pair(tmDevice->resourceCode, tmDevice));
			}
		}

		//TmDeviceTime
		dbg = "TmDeviceTime";
		{
			vector<void*>& csvTmDeviceTimeList = reader.datas["TmDeviceTime"];
			for (i = 0; i < csvTmDeviceTimeList.size(); i++) {
				std::shared_ptr<TmDeviceTime> tmDeviceTime = std::make_shared<TmDeviceTime>((*(TmDeviceTime*)csvTmDeviceTimeList[i]));
				this->tmDeviceTimeList.emplace_back(tmDeviceTime);
			}
			this->tmDeviceTimeIndex = std::make_shared<TmDeviceTimeIndex>(this->tmDeviceTimeList, this);
		}

		dbg = "DepartmentGroup";
		vector<void*> csvDepartmentGroupList = reader.datas["DepartmentGroup"];
		for (i = 0; i < csvDepartmentGroupList.size(); i++) {
			DEPARTMENT_GROUP* obj = (DEPARTMENT_GROUP*)csvDepartmentGroupList[i];
			this->departmentGroupList.push_back(shared_ptr<DEPARTMENT_GROUP>(new DEPARTMENT_GROUP(*(DEPARTMENT_GROUP*)obj)));
		}

		//TmPairingChart
		dbg = "TmPairingChart";
		{
			vector<void*>& csvTmPairingChartList = reader.datas["TmPairingChart"];
			for (i = 0; i < csvTmPairingChartList.size(); i++) {
				std::shared_ptr<TmPairingChart> tmPairingChart = std::make_shared<TmPairingChart>((*(TmPairingChart*)csvTmPairingChartList[i]));
				this->tmPairingChartList.emplace_back(tmPairingChart);
			}
			this->tmPairingChartIndex = std::make_shared<TmPairingChartIndex>(this->tmPairingChartList);
		}

		//TmPairingChartRole
		dbg = "TmPairingChartRole";
		{
			vector<void*>& csvTmPairingChartRoleList = reader.datas["TmPairingChartRole"];
			for (i = 0; i < csvTmPairingChartRoleList.size(); i++) {
				std::shared_ptr<TmPairingChartRole> tmPairingChartRole = std::make_shared<TmPairingChartRole>((*(TmPairingChartRole*)csvTmPairingChartRoleList[i]));
				this->tmPairingChartRoleList.emplace_back(tmPairingChartRole);
			}
			this->tmPairingChartRoleIndex = std::make_shared<TmPairingChartRoleIndex>(this->tmPairingChartRoleList);
		}

		//TmPairingChartRoleQual
		dbg = "TmPairingChartRoleQual";
		{
			vector<void*>& csvTmPairingChartRoleQualList = reader.datas["TmPairingChartRoleQual"];
			for (i = 0; i < csvTmPairingChartRoleQualList.size(); i++) {
				std::shared_ptr<TmPairingChartRoleQual> tmPairingChartRoleQual = std::make_shared<TmPairingChartRoleQual>((*(TmPairingChartRoleQual*)csvTmPairingChartRoleQualList[i]));
				this->tmPairingChartRoleQualList.emplace_back(tmPairingChartRoleQual);
			}
			this->tmPairingChartRoleQualIndex = std::make_shared<TmPairingChartRoleQualIndex>(this->tmPairingChartRoleQualList);
		}

		//TmPairingChartCourse
		dbg = "TmPairingChartCourse";
		{
			vector<void*>& csvTmPairingChartCourseList = reader.datas["TmPairingChartCourse"];
			for (i = 0; i < csvTmPairingChartCourseList.size(); i++) {
				std::shared_ptr<TmPairingChartCourse> tmPairingChartCourse = std::make_shared<TmPairingChartCourse>((*(TmPairingChartCourse*)csvTmPairingChartCourseList[i]));
				this->tmPairingChartCourseList.emplace_back(tmPairingChartCourse);
			}
			this->tmPairingChartCourseIndex = std::make_shared<TmPairingChartCourseIndex>(this->tmPairingChartCourseList);
		}

		dbg = "CrewMonthManday";
		vector<void*> csvCrewMonthMandayList = reader.datas["CrewMonthManday"];
		for (i = 0; i < csvCrewMonthMandayList.size(); i++) {
			CrewMonthManday* obj = static_cast<CrewMonthManday*>(csvCrewMonthMandayList[i]);
			//std::shared_ptr<CrewMonthManday> obj ();
			shared_ptr<CrewMonthManday> obj2 = make_shared<CrewMonthManday>(*(static_cast<CrewMonthManday*>(csvCrewMonthMandayList[i])));
			this->crewMonthMandayList.emplace_back(obj2);
		}
        dbg = "PortLOStatistics";
        vector<void*> csvPortLOStatisticsList = reader.datas["PortLoStatistics"];
        for (i = 0; i < csvPortLOStatisticsList.size(); i++) {
            PORT_LO_STATISTICS* obj = static_cast<PORT_LO_STATISTICS*>(csvPortLOStatisticsList[i]);
            shared_ptr<PORT_LO_STATISTICS> obj2 = make_shared<PORT_LO_STATISTICS>(*(static_cast<PORT_LO_STATISTICS*>(csvPortLOStatisticsList[i])));
            this->portLayoverStatisticsList.emplace_back(obj2);
        }
		dbg = "HistoryCrewStatistics";
		vector<void*> csvHistoryCrewStatisticsList = reader.datas["HistoryCrewStatistics"];
		for (i = 0; i < csvHistoryCrewStatisticsList.size(); i++) {
			HISTORY_CREW_STATISTICS* obj = (HISTORY_CREW_STATISTICS*)csvHistoryCrewStatisticsList[i];
			this->historyCrewStatisticsList.push_back(shared_ptr<HISTORY_CREW_STATISTICS>(new HISTORY_CREW_STATISTICS(*(HISTORY_CREW_STATISTICS*)obj)));
			this->historyCrewStatisticsMap.emplace(obj->crewId, shared_ptr<HISTORY_CREW_STATISTICS>(new HISTORY_CREW_STATISTICS(*(HISTORY_CREW_STATISTICS*)obj)));
		}

		dbg = "HistoryDepartmentStatistics";
		vector<void*> csvHistoryDepartmentStatisticsList = reader.datas["HistoryDepartmentStatistics"];
		for (i = 0; i < csvHistoryDepartmentStatisticsList.size(); i++) {
			HISTORY_DEPARTMENT_STATISTICS* obj = (HISTORY_DEPARTMENT_STATISTICS*)csvHistoryDepartmentStatisticsList[i];
			this->historyDepartmentStatisticsList.push_back(shared_ptr<HISTORY_DEPARTMENT_STATISTICS>(new HISTORY_DEPARTMENT_STATISTICS(*(HISTORY_DEPARTMENT_STATISTICS*)obj)));
		}
		//dbg = "PairingDutyNode";
		//vector<void*> csvPairingDutyNodeList = reader.datas["PairingDutyNode"];
		//for (i = 0; i < csvPairingDutyNodeList.size(); i++) {
		//	PairingDutyNode* obj = (PairingDutyNode*)csvPairingDutyNodeList[i];
		//	this->csvPairingDutyNodeList.push_back(shared_ptr<PairingDutyNode>(new PairingDutyNode(*(PairingDutyNode*)obj)));
		//}

		dbg = "Route";//20180928 ain, OP#1901
		vector<void*> csvRouteList = reader.datas["Route"];
		for (i = 0; i < csvRouteList.size(); i++) {
			Route* obj = (Route*)csvRouteList[i];
			this->routeList.push_back(shared_ptr<Route>(new Route(*(Route*)obj)));
		}

		dbg = "RankCombinationCriteria";//20180928 ain, OP#1901
		vector<void*> csvRankCombCriteriaList = reader.datas["RankCombinationCriteria"];
		for (i = 0; i < csvRankCombCriteriaList.size(); i++) {
			RankCombinationCriteria* obj = (RankCombinationCriteria*)csvRankCombCriteriaList[i];
			this->rankCombinationCriteriaMap[obj->id] = shared_ptr<RankCombinationCriteria>(new RankCombinationCriteria(*(RankCombinationCriteria*)obj));
		}

		dbg = "RankCombination";//20181010 ain, OP#1901
		vector<void*> csvRankCombList = reader.datas["RankCombination"];
		for (i = 0; i < csvRankCombList.size(); i++) {
			RankCombination* obj = (RankCombination*)csvRankCombList[i];
			shared_ptr<RankCombination> copy = shared_ptr<RankCombination>(new RankCombination(*(RankCombination*)obj));
			long long criteriaId = obj->rankCombCriteriaId;
			if (rankCombinationMap.find(criteriaId) == rankCombinationMap.end())
				rankCombinationMap[criteriaId] = vector<SharedPtr<RankCombination>>();
			rankCombinationMap[criteriaId].push_back(copy);
		}
		//20190528 ain, mantis#5682, sort by option/seqOrder
		for (auto& it : rankCombinationMap) {
			std::sort(it.second.begin(), it.second.end(), [](SharedPtr<RankCombination>& o1, SharedPtr<RankCombination>& o2) -> bool {
				if (o1->options != o2->options) return o1->options < o2->options;
				else return o1->seqOrder < o2->seqOrder;
			});

			//准备每个combID对应有哪些ranks，用于多部门组员数据同时存在一个场景中，rosterFlight过滤掉其它部门的组员，否则会影响8091计算
			std::unordered_map<long long, std::set<int>> rankCombIdToOptions;
			std::unordered_map<long long, std::unordered_map<int, std::unordered_map<std::string, int>>> rankCombIdToOptionToActingRankToNum;
			long long criteriaId = it.first;
			for (auto& rankComb : it.second) {
				int option = rankComb->options;
				int seqOrder = rankComb->seqOrder;
				string actingRank = rankComb->rank;
				vector<string> positions;
				split(rankComb->positions, '|', positions);

				rankCombIdToOptions[criteriaId].insert(option);
				if (!positions.empty()) { //空位置不计算配比
					rankCombIdToOptionToActingRankToNum[criteriaId][option][actingRank]++;
				}

				rankCombIdToActingRankToNum[criteriaId][actingRank] = 0;
			}
			//取每个criteriaId下actingRank的最大值
			for (const auto& obj1 : rankCombIdToOptionToActingRankToNum) {
				long long criteriaId = obj1.first;
				for (const auto& obj2 : obj1.second) {
					int option = obj2.first;
					for (const auto& obj3 : obj2.second) {
						const string& actingRank = obj3.first;
						int num = obj3.second;
						if (num > rankCombIdToActingRankToNum.at(criteriaId).at(actingRank)) {
							rankCombIdToActingRankToNum[criteriaId][actingRank] = num;
						}
					}
				}
			}
		}

		//scenarioKpi  20220525 jx.jin
		dbg = "ScenarioKpi";
		vector<void*> csvScenarioKpiList = reader.datas["ScenarioKpi"];
		for (i = 0; i < csvScenarioKpiList.size(); i++) {
			ScenarioKpi* obj = (ScenarioKpi*)csvScenarioKpiList[i];
			scenarioKpiMap[obj->kpiNames] = obj->kpiValues;
		}
		//scenario
		dbg = "scenario";
		loadWorksetAndScenario(this, reader, baseObjMap, rankObjMap, fleetIdMap, tmpAttrMap, tmpTagMap);

		dbg = "LiveConfig";
		{
			vector<void*> csvLiveConfigList = reader.datas["LiveConfig"];
			for (size_t i = 0; i < csvLiveConfigList.size(); i++) {
				std::shared_ptr<LiveConfig> liveConfig = std::make_shared<LiveConfig>((*(LiveConfig*)csvLiveConfigList[i]));
				liveConfigList.push_back(liveConfig);
			}
		}

		dbg = "ruleSet";
		loadRuleSet(this, reader);

		dbg = "rule";
		loadRule(this, reader);

		//TmPairingChartCourse
		dbg = "RulePhaseConfig";
		{
			vector<void*>& csvRulePhaseConfigList = reader.datas["RulePhaseConfig"];
			for (i = 0; i < csvRulePhaseConfigList.size(); i++) {
				std::shared_ptr<RulePhaseConfig> rulePhaseConfig = std::make_shared<RulePhaseConfig>((*(RulePhaseConfig*)csvRulePhaseConfigList[i]));
				this->rulePhaseConfigMap[rulePhaseConfig->id] = rulePhaseConfig;
			}
		}

		if (this->_isServiceMode || RuleParams::GetInstancePtr()->getApplication() == BATCH_LEGALITY) {
			dbg = "allRule";
			loadAllRule(this, reader);
		}

		dbg = "cqf";
		loadCqf(this, reader);
		
		dbg = "PortQualReqmnt";
		loadPortQualReqmnt(this, reader);

		dbg = "QualExtensionConfig";
		loadQualExtensionConfig(this, reader);

		dbg = "flight/flightComposition";
		//flight
		//map<long long, shared_ptr<Segment>> flightIdMap;
		loadFlightAndCompAndAttr(this->flightIdMap, this->flightList, reader, this);

		//20190222 ain, OP#1840, 航班解析后放入 dbData->flightList, 以便ruleTool change_flight使用
		//for (auto& it : flightIdMap) {
		//	SharedPtr<Segment> old = it.second;
		//  fillSegmentLocTimeField(old.get(), this->airportCodeMap, this);
		//	SharedPtr<Segment> copy(new Segment(*old));
		//	flightIdMap[it.first] = copy;
		//	this->flightList.push_back(copy);
		//}
		
		dbg = "flight(Commute)";
		loadCsvFlightCommute(this, reader);

		dbg = "pairing/duty/segment";
		loadPairingDutySegment(pairingIdMap, flightIdMap, compositionRankValueMap, reader, this);

		//pairingList -> pairingIdMap
		for (auto it = pairingIdMap.begin(); it != pairingIdMap.end(); it++) {
			Pairing * copy = it->second;
			copy->initAssignedDutyCode();
			this->pairingList.push_back(copy);
		}

		//mantis#1405, 增加pairing下duty/seg按时间排序
		//20190823 ain, mantis#6547, duty/segment, 按utc排序代替loc, 避免时区不同导致排序错误
		for (Pairing* p : this->pairingList) {
			vector<Duty*> dutyList = p->getDutyVec();
			std::stable_sort(dutyList.begin(), dutyList.end(),
				[](Duty* a, Duty* b) -> bool
			{
				return a->getStartTimeUtcAct() < b->getStartTimeUtcAct();
			});
			p->setDutyVec(dutyList);
			dutyList.clear();
			
			for (Duty * d : p->getDutyVec()) {
				vector<Segment*> segList = d->getSegments();
				std::stable_sort(segList.begin(), segList.end(),
					[](Segment* a, Segment* b) -> bool
				{
					return a->getStartTimeUtcAct() < b->getStartTimeUtcAct();
				});
				d->setSegments(segList);
				segList.clear();
			}
		}
		dbg = "EvaCrDefaultDutyTime";
		{
			vector<void*> csvEvaCrDefaultDutyTimeList = reader.datas["EvaCrDefaultDutyTime"];
			for (void* csvItem : csvEvaCrDefaultDutyTimeList) {
				CsvEvaCrDefaultDutyTime * item = (CsvEvaCrDefaultDutyTime*)csvItem;
				string s = item->ddtAssignmentUnitQualifier + item->ddtBaseAirportCode;
				vector<time_t> times;
				string ss = item->ddtDefaultLocalStrTime;
				std::size_t iPos = ss.find(":");
				int timeStart = 0;
				if (iPos != string::npos)
					timeStart = stoi(ss.substr(0, iPos)) * 3600 + stoi(ss.substr(iPos + 1)) * 60;
				times.push_back(timeStart);
				times.push_back(item->ddtDefaultDurationMins * 60);
				this->CsvEvaCrDefaultDutyTimeMap[s].push_back(times);
			}
		}
		dbg = "Recency";
		{
			time_t scenarioStartLoc = utcToLocal(scenario.startDtUTC);
			vector<void*> csvRecencyList = reader.datas["Recency"];
			vector<shared_ptr<CrewRecency>> recencyList;
			for (void* csvItem : csvRecencyList) {
				CrewRecency * item = (CrewRecency*)csvItem;
				//20180802 ain, mantis#3708, loadData只读入有效部分
				if (item->crewDateLoc < scenarioStartLoc) {
					shared_ptr<CrewRecency> copy(new CrewRecency);
					copy->copy(item);
					copy->crewDateUtc = localToUtc(copy->crewDateLoc);
					recencyList.push_back(copy);
				}
			}
			this->recencyMgr.initCrewRecency(recencyList);
		}

		dbg = "RecencyRules";
		{
			vector<void*> csvRecencyRulesList = reader.datas["RecencyRules"];
			vector<shared_ptr<CrewRecencyRules>> recencyRulesList;
			for (void* csvItem : csvRecencyRulesList) {
				CrewRecencyRules * item = (CrewRecencyRules*)csvItem;
				shared_ptr<CrewRecencyRules> copy(new CrewRecencyRules);
				copy->copy(item);
				recencyRulesList.push_back(copy);
			}
			this->recencyMgr.setCrewRecencyRules(recencyRulesList);
		}

		dbg = "FleetRecency";
		{
			vector<void*> csvCrewFleetRecencyList = reader.datas["FleetRecency"];
			vector<shared_ptr<CrewFleetRecency>> crewFleetRecencyList;
			for (void* csvItem : csvCrewFleetRecencyList) {
				CrewFleetRecency * item = (CrewFleetRecency*)csvItem;
				shared_ptr<CrewFleetRecency> copy(new CrewFleetRecency);
				copy->copy(item);
				crewFleetRecencyList.push_back(copy);
			}
			this->recencyMgr.initCrewFleetRecency(crewFleetRecencyList);
		}

		dbg = "PortRecency";
		{
			vector<void*> csvCrewPortRecencyList = reader.datas["PortRecency"];
			vector<shared_ptr<CrewPortRecency>> crewPortRecencyList;
			for (void* csvItem : csvCrewPortRecencyList) {
				CrewPortRecency * item = (CrewPortRecency*)csvItem;
				shared_ptr<CrewPortRecency> copy(new CrewPortRecency);
				copy->copy(item);
				crewPortRecencyList.push_back(copy);
			}
			this->recencyMgr.initCrewPortRecency(crewPortRecencyList);
		}

		dbg = "AirCraft";
		vector<void*> csvAircraftList = reader.datas["Aircraft"];
		for (i = 0; i < csvAircraftList.size(); i++) {
			DBAircraft* obj = (DBAircraft*)csvAircraftList[i];
			string segRegister = obj->acReg;
			shared_ptr<DBAircraft> copy = shared_ptr<DBAircraft>(new DBAircraft(*(DBAircraft*)obj));
			this->fltIdToAircraftMap.insert(map<string, SharedPtr<DBAircraft>>::value_type(segRegister, copy));
		}
		dbg = "RouteActualRest";
		{
			vector<void*>& csvList = reader.datas["RouteActualRest"];
			for (void* csvItem : csvList) {
				RouteActualRest * item = (RouteActualRest*)csvItem;
				shared_ptr<RouteActualRest> copy(new RouteActualRest(*item));
				routeActualRestList.push_back(copy);
			}
			ClearCsvReaderData(RouteActualRest, csvList);
		}

		dbg = "CREW/CREW_RANK/CREW_COMPANY_RANK/CREW_BASE/CREW_FLEET/CREW_QUALIFICATION/CREW_ENTITLEMENT/CREW_GUARANTEE_HOUR";
		{
			vector<void*>& csvCrewList = reader.datas["Crew"];
			vector<void*>& csvCrewRankList = reader.datas["CrewRank"];
			vector<void*>& csvCrewCompanyRankList = reader.datas["CrewCompanyRank"];
			vector<void*>& csvCrewBaseList = reader.datas["CrewBase"];
			vector<void*>& csvCrewFleetList = reader.datas["CrewFleet"];
			vector<void*>& csvCrewQualList = reader.datas["CrewQualification"];
			vector<void*>& csvCrewCertificateList = reader.datas["CrewCertificate"];
			vector<void*>& csvCrewLicenseList = reader.datas["CrewLicense"];
			vector<void*>& csvCrewLanguageList = reader.datas["CrewLanguage"];
			vector<void*>& csvCrewEntitlementList = reader.datas["CrewEntitlement"];
			vector<void*>& csvCrewGuaranteeHourList = reader.datas["CrewGuaranteeHour"];
			vector<void*>& csvCrewStatusList = reader.datas["CrewStatus"];
			vector<void*>& csvCrewTeamList = reader.datas["CrewTeam"];
			vector<void*>& csvCrewPrefList = reader.datas["CrewPreference"];
			vector<void*>& csvCrewProfileList = reader.datas["CrewProfile"];
			vector<void*>& csvCrewMandayList = reader.datas["CrewMandayCcAm"];
			vector<void*>& csvPublishCrewMandayList = reader.datas["PublishedCrewMandayCcAm"];
			vector<void*>& csvCrewMandayFdList = reader.datas["CrewMandayFd"];
			vector<void*>& csvPublishCrewMandayFdList = reader.datas["PublishedCrewMandayFd"];
            vector<void*>& csvCrewRequestDetailList = reader.datas["CrewRequestDetail"];
            vector<void*>& csvCrewRequestRecordDetailList = reader.datas["CrewRequestRecordDetail"];
            vector<void*>& csvCrewRequestRecordList = reader.datas["CrewRequestRecord"];
			vector<void*>& csvCrewKpiAdjustList = reader.datas["CrewKpiAdjust"];
            vector<void*>& csvBidList = reader.datas["Bid"];
            vector<void*>& csvBidRequirementList = reader.datas["BidRequirement"];
            vector<void*>& csvBidRequirementDetailList = reader.datas["BidRequirementDetail"];
            vector<void*>& csvBiddingSequenceGroupList = reader.datas["BiddingSequenceGroup"];
            vector<void*>& csvBiddingSequenceList = reader.datas["BiddingSequence"];
			vector<void*>& csvCrewSeniorityList = reader.datas["CrewSeniority"];
			vector<void*>& csvCrewFirstDutyInfoList = reader.datas["CrewFirstDutyInfo"];
            std::unordered_map<long long, shared_ptr<CREW_REQUEST_RECORD>> crewRequestRecordMap;
			
			//RO优化：根据WorkSet的division和filiale过滤Crew数据
			const string& worksetDivision = this->scenario.division;
			const string& worksetFiliale = this->scenario.airline;
			bool isRoScenario = (this->scenarioId > 0 && this->scenario.category == "RO");
			
			for (i = 0; i < csvCrewList.size(); i++) {
				shared_ptr<CREW> crew(new CREW(*(CREW*)csvCrewList[i]));
				
				//RO场景下过滤Crew数据
				if (isRoScenario && !worksetDivision.empty() && !worksetFiliale.empty()) {
					//如果Crew.Division != workset.division，并且Crew.filiale != workset.filiale，过滤该Crew数据
					if (crew->division != worksetDivision || crew->airline != worksetFiliale) {
						continue; //跳过不符合条件的Crew
					}
				}
				
				this->crewList.push_back(crew);
				this->crewIdMap[crew->idCrew] = crew;
				
			}
			Logger::getRuleLogger()->info("parse crew size={}", crewList.size());
			for (i = 0; i < csvCrewRankList.size(); i++) {
				shared_ptr<CREW_RANK> copy(new CREW_RANK(*(CREW_RANK*)csvCrewRankList[i]));
				if (crewIdMap.find(copy->idCrew) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_rank data, crew=" << copy->idCrew << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->idCrew];
				crew->rankList.push_back(copy);
			}
			for (i = 0; i < csvCrewCompanyRankList.size(); i++) {
				shared_ptr<CREW_COMPANY_RANK> copy(new CREW_COMPANY_RANK(*(CREW_COMPANY_RANK*)csvCrewCompanyRankList[i]));
				if (crewIdMap.find(copy->idCrew) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_company_rank data, crew=" << copy->idCrew << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->idCrew];
				crew->companyRankList.push_back(copy);
			}
			for (i = 0; i < csvCrewBaseList.size(); i++) {
				shared_ptr<CREW_BASE> copy(new CREW_BASE(*(CREW_BASE*)csvCrewBaseList[i]));

				//mantis#2493
				int offsetMinutes = timezone / 60;
				if (airportUtcOffsetMap.find(copy->base) != airportUtcOffsetMap.end())
					offsetMinutes = airportUtcOffsetMap[copy->base];
				copy->effUtc = copy->effLoc - 60 * offsetMinutes;
				copy->expUtc = copy->expLoc - 60 * offsetMinutes;

				if (crewIdMap.find(copy->idCrew) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_base data, crew=" << copy->idCrew << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->idCrew];
				crew->baseList.push_back(copy);
			}

			for (i = 0; i < csvCrewFleetList.size(); i++) {
				shared_ptr<CREW_FLEET> copy(new CREW_FLEET(*(CREW_FLEET*)csvCrewFleetList[i]));
				if (crewIdMap.find(copy->idCrew) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_fleet data, crew=" << copy->idCrew << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->idCrew];
				crew->fleetList.push_back(copy);
			}
			for (i = 0; i < csvCrewQualList.size(); i++) {
				if (!((CREW_QUALIFICATION*)csvCrewQualList[i])->isValid) {
					continue;
				}
				shared_ptr<CREW_QUALIFICATION> copy(new CREW_QUALIFICATION(*(CREW_QUALIFICATION*)csvCrewQualList[i]));
				if (crewIdMap.find(copy->idCrew) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_qual data, crew=" << copy->idCrew << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->idCrew];
				crew->qualificationList.push_back(copy);

				string combQuals = filterQualsByCombsRules();
				if (combQuals.find(copy->qual) != std::string::npos) {
					crew->qualListFiltedByRules[copy->qual] = copy;
				}

				shared_ptr<CREW_QUALIFICATION> copyInDb(new CREW_QUALIFICATION(*(CREW_QUALIFICATION*)csvCrewQualList[i]));
				crew->qualificationListInDb.push_back(copyInDb);
			}
			for (i = 0; i < csvCrewCertificateList.size(); i++) {
                //If the qualification is in QualExtensionConfig, we need consider his qual even if it is valid.
                bool isInQualExtensionConfig = false;
                for(const auto& qualExt : this->qualExtensionConfigMap){
                    const auto& qual = qualExt.second;
                    if(qual.find(((CREW_QUALIFICATION*)csvCrewCertificateList[i])->qual) != qual.end()){
                        isInQualExtensionConfig = true;
                        break;
                    }
                }

				if (!((CREW_QUALIFICATION*)csvCrewCertificateList[i])->isValid && !isInQualExtensionConfig) {
					continue;
				}
				shared_ptr<CREW_QUALIFICATION> copy(new CREW_QUALIFICATION(*(CREW_QUALIFICATION*)csvCrewCertificateList[i]));
				if (crewIdMap.find(copy->idCrew) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_certificate data, crew=" << copy->idCrew << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->idCrew];
				crew->qualificationList.push_back(copy);

				string combQuals = filterQualsByCombsRules();
				if (combQuals.find(copy->qual) != std::string::npos) {
					crew->qualListFiltedByRules[copy->qual] = copy;
				}

				shared_ptr<CREW_QUALIFICATION> copyInDb(new CREW_QUALIFICATION(*(CREW_QUALIFICATION*)csvCrewCertificateList[i]));
				crew->qualificationListInDb.push_back(copyInDb);

			}
			for (i = 0; i < csvCrewLicenseList.size(); i++) {
				if (!((CREW_QUALIFICATION*)csvCrewLicenseList[i])->isValid) {
					continue;
				}
				shared_ptr<CREW_QUALIFICATION> copy(new CREW_QUALIFICATION(*(CREW_QUALIFICATION*)csvCrewLicenseList[i]));
				if (crewIdMap.find(copy->idCrew) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_license data, crew=" << copy->idCrew << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->idCrew];
				crew->qualificationList.push_back(copy);

				string combQuals = filterQualsByCombsRules();
				if (combQuals.find(copy->qual) != std::string::npos) {
					crew->qualListFiltedByRules[copy->qual] = copy;
				}

				shared_ptr<CREW_QUALIFICATION> copyInDb(new CREW_QUALIFICATION(*(CREW_QUALIFICATION*)csvCrewLicenseList[i]));
				crew->qualificationListInDb.push_back(copyInDb);
			}
			for (i = 0; i < csvCrewLanguageList.size(); i++) {
				if (!((CREW_QUALIFICATION*)csvCrewLanguageList[i])->isValid) {
					continue;
				}
				shared_ptr<CREW_QUALIFICATION> copy(new CREW_QUALIFICATION(*(CREW_QUALIFICATION*)csvCrewLanguageList[i]));
				if (crewIdMap.find(copy->idCrew) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_language data, crew=" << copy->idCrew << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->idCrew];
				crew->qualificationList.push_back(copy);

				string combQuals = filterQualsByCombsRules();
				if (combQuals.find(copy->qual) != std::string::npos) {
					crew->qualListFiltedByRules[copy->qual] = copy;
				}

				shared_ptr<CREW_QUALIFICATION> copyInDb(new CREW_QUALIFICATION(*(CREW_QUALIFICATION*)csvCrewLanguageList[i]));
				crew->qualificationListInDb.push_back(copyInDb);
			}
			for (i = 0; i < csvCrewEntitlementList.size(); i++) {
				shared_ptr<CREW_ENTITLEMENT> copy(new CREW_ENTITLEMENT(*(CREW_ENTITLEMENT*)csvCrewEntitlementList[i]));
				if (crewIdMap.find(copy->crewId) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_entitlement data, crew=" << copy->crewId << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->crewId];
				if (copy->effDt == -1){
					string s = Utility::GetInstancePtr()->iToa(copy->year) + "-01-01 00:00:00 ";
					copy->effDt = utcStrToUtc((char*)s.c_str());
				}
				if (copy->expDt == -1){
					string s = Utility::GetInstancePtr()->iToa(copy->year) + "-12-31 23:59:59";
					copy->expDt = utcStrToUtc((char*)s.c_str());
				}
				crew->entitlements.push_back(copy);
			}
			for (i = 0; i < csvCrewGuaranteeHourList.size(); i++) {
				shared_ptr<CREW_GUARANTEE_HOUR> copy(new CREW_GUARANTEE_HOUR(*(CREW_GUARANTEE_HOUR*)csvCrewGuaranteeHourList[i]));
				if (crewIdMap.find(copy->idCrew) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_guarantee_hour data, crew=" << copy->idCrew << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->idCrew];
				crew->guaranteeHourList.push_back(copy);
			}

			for (i = 0; i < csvCrewStatusList.size(); i++) {
				shared_ptr<CREW_STATUS> copy(new CREW_STATUS(*(CREW_STATUS*)csvCrewStatusList[i]));
				if (crewIdMap.find(copy->idcrew) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_status data, crew=" << copy->idcrew << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->idcrew];
				crew->statusList.push_back(copy);
			}
			for (i = 0; i < csvCrewTeamList.size(); i++) {
				//移除isValid判断，以应对使用历史数据跑场景
				/* if (!((CREW_TEAM*)csvCrewTeamList[i])->isValid) {
					continue;
				} */ 
				shared_ptr<CREW_TEAM> copy(new CREW_TEAM(*(CREW_TEAM*)csvCrewTeamList[i]));
				if (crewIdMap.find(copy->idcrew) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_team data, crew=" << copy->idcrew << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->idcrew];
				copy->teamName = teamObjMap[copy->team_id].team;
				crew->teamList.push_back(copy);
			}
			for (i = 0; i < csvCrewPrefList.size(); i++) {
				shared_ptr<CREW_PREFERENCE> copy(new CREW_PREFERENCE(*(CREW_PREFERENCE*)csvCrewPrefList[i]));
				if (crewIdMap.find(copy->idCrew) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_pref data, crew=" << copy->idCrew << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->idCrew];
				crew->preferenceList.push_back(copy);
				for (auto crewId : copy->relatedCrewIds){
					if (crewIdMap.find(crewId) == crewIdMap.end()) {
						errLog << "ERROR: invalid crew_pref data, crew=" << crewId << " not found" << endl;
						continue;
					}
					shared_ptr<CREW> relatedcrew = this->crewIdMap[crewId];
					shared_ptr<CREW_PREFERENCE> relatedcopy(new CREW_PREFERENCE(*(CREW_PREFERENCE*)csvCrewPrefList[i]));
					relatedcopy->idCrew = crewId;
					relatedcopy->relatedCrewIds.clear();
					relatedcopy->relatedCrewIds.push_back(copy->idCrew);
					relatedcrew->preferenceList.push_back(relatedcopy);
				}
			}
            for (i = 0; i < csvCrewRequestRecordList.size(); i++) {
                shared_ptr<CREW_REQUEST_RECORD> copy(new CREW_REQUEST_RECORD(*(CREW_REQUEST_RECORD*)csvCrewRequestRecordList[i]));
                if (crewIdMap.find(copy->crewId) == crewIdMap.end()) {
                    //errLog << "ERROR: invalid crew_request_detail data, crew=" << copy->crewId << " not found" << endl;
                    continue;
                }
                crewRequestRecordMap[copy->id] = copy;
            }
			for (i = 0; i < csvCrewRequestRecordDetailList.size(); i++) {
				shared_ptr<CREW_REQUEST_RECORD_DETAIL> copy(new CREW_REQUEST_RECORD_DETAIL(*(CREW_REQUEST_RECORD_DETAIL*)csvCrewRequestRecordDetailList[i]));
				if (crewIdMap.find(copy->crewId) == crewIdMap.end()) {
					//errLog << "ERROR: invalid crew_request_detail data, crew=" << copy->crewId << " not found" << endl;
					continue;
				}
                if(crewRequestRecordMap.find(copy->reqId) == crewRequestRecordMap.end())
                    continue;
                copy->attributes = crewRequestRecordMap.at(copy->reqId)->preference;
				shared_ptr<CREW> crew = this->crewIdMap[copy->crewId];
//				int offsetMinutes = this->getAirportOffsetMinutes(crew->getPrimeBase());
//				copy->startDtUtc = localStrToUtc((char*)copy->startDateLocalStr.c_str(), offsetMinutes);
//				copy->endDtUtc = localStrToUtc((char*)copy->endDateLocalStr.c_str(), offsetMinutes);
				crew->crewRequestRecordDetailList.push_back(copy);
			}
            crewRequestRecordMap.clear();
			for (i = 0; i < csvCrewProfileList.size(); i++) {
				shared_ptr<CREW_PROFILE> copy(new CREW_PROFILE(*(CREW_PROFILE*)csvCrewProfileList[i]));
				if (crewIdMap.find(copy->crewId) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_pref data, crew=" << copy->crewId << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->crewId];
				crew->profiles.push_back(copy);
			}
			for (i = 0; i < csvCrewMandayList.size(); i++) {
				shared_ptr<CREW_MANDAY_CC_AM> copy(new CREW_MANDAY_CC_AM(*(CREW_MANDAY_CC_AM*)csvCrewMandayList[i]));
				if (crewIdMap.find(copy->idCrew) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_manday data, crew=" << copy->idCrew << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->idCrew];
				crew->mandayCcAmList.push_back(copy);
			}
			for (i = 0; i < csvPublishCrewMandayList.size(); i++) {
				shared_ptr<CREW_MANDAY_CC_AM> copy(new CREW_MANDAY_CC_AM(*(CREW_MANDAY_CC_AM*)csvPublishCrewMandayList[i]));
				if (crewIdMap.find(copy->idCrew) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_manday data, crew=" << copy->idCrew << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->idCrew];
				crew->publishedMandayCcAmList.push_back(copy);
			}
			for (i = 0; i < csvCrewMandayFdList.size(); i++) {
				shared_ptr<CREW_MANDAY_FD> copy(new CREW_MANDAY_FD(*(CREW_MANDAY_FD*)csvCrewMandayFdList[i]));
				if (crewIdMap.find(copy->idCrew) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_manday data, crew=" << copy->idCrew << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->idCrew];
				crew->mandayFdList.push_back(copy);
			}
			for (i = 0; i < csvPublishCrewMandayFdList.size(); i++) {
				shared_ptr<CREW_MANDAY_FD> copy(new CREW_MANDAY_FD(*(CREW_MANDAY_FD*)csvPublishCrewMandayFdList[i]));
				if (crewIdMap.find(copy->idCrew) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_manday data, crew=" << copy->idCrew << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->idCrew];
				crew->publishedMandayFdList.push_back(copy);
			}
			for (i = 0; i < csvCrewKpiAdjustList.size(); i++) {
				//shared_ptr<CrewKpiAdjust> copy((CrewKpiAdjust*)csvCrewKpiAdjustList[i]);
				shared_ptr<CrewKpiAdjust> copy(new CrewKpiAdjust(*(CrewKpiAdjust*)csvCrewKpiAdjustList[i]));
				if (crewIdMap.find(copy->idCrew) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_kpi_adjust data, crew=" << copy->idCrew << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->idCrew];
				//crew->crewKpiAdjustList.push_back(copy->getPtr());
				crew->crewKpiAdjustList.push_back(copy);
			}
            // Bidding相关数据处理
            std::unordered_map<long long, std::shared_ptr<Bid>> bidMap;
            for (i = 0; i < csvBidList.size(); ++i) {
                shared_ptr<Bid> copy(new Bid(*(Bid*)csvBidList[i]));
                if (crewIdMap.find(copy->crewId) == crewIdMap.end()) {
                    continue;
                }
                bidMap[copy->id] = copy;
                this->crewIdMap[copy->crewId]->crewBidItems.push_back(copy);
            }
            std::unordered_map<long long, std::shared_ptr<BidRequirement>> bidRequirementMap;
            for(i = 0; i < csvBidRequirementList.size(); ++i){
                shared_ptr<BidRequirement> copy(new BidRequirement(*(BidRequirement*)csvBidRequirementList[i]));
                if (bidMap.find(copy->bidId) == bidMap.end()) {
                    continue;
                }
                bidRequirementMap[copy->id] = copy;
                bidMap[copy->bidId]->requirements.push_back(copy);
            }
            for(i = 0; i < csvBidRequirementDetailList.size(); ++i){
                shared_ptr<BidRequirementDetail> copy(new BidRequirementDetail(*(BidRequirementDetail*)csvBidRequirementDetailList[i]));
                if (bidRequirementMap.find(copy->bidRequirementId) == bidRequirementMap.end()) {
                    continue;
                }
                bidRequirementMap[copy->bidRequirementId]->details.push_back(copy);
            }
            std::unordered_map<long long, std::shared_ptr<BiddingSequenceGroup>> bidSequenceGroupMap;
            for(i = 0; i < csvBiddingSequenceGroupList.size(); ++i){
                shared_ptr<BiddingSequenceGroup> copy(new BiddingSequenceGroup(*(BiddingSequenceGroup*)csvBiddingSequenceGroupList[i]));
                this->bidSequenceGroups.push_back(copy);
                bidSequenceGroupMap[copy->id] = copy;
            }
            for(i = 0; i < csvBiddingSequenceList.size(); ++i){
                shared_ptr<BiddingSequence> copy(new BiddingSequence(*(BiddingSequence*)csvBiddingSequenceList[i]));
                if (bidMap.find(copy->bidId) == bidMap.end()) {
                    continue;
                }
                copy->bidItem = bidMap.at(copy->bidId);
                if(bidSequenceGroupMap.find(copy->groupId) == bidSequenceGroupMap.end()){
                    continue;
                }
                bidSequenceGroupMap[copy->groupId]->biddingSequences.push_back(copy);
            }
			for (i = 0; i < csvCrewSeniorityList.size(); ++i) {
				shared_ptr<CREW_SENIORITY> copy(new CREW_SENIORITY(*(CREW_SENIORITY*)csvCrewSeniorityList[i]));
				if (crewIdMap.find(copy->idCrew) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_fleet data, crew=" << copy->idCrew << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->idCrew];
				crew->seniority = copy->seniority;
				crew->serviceDay = copy->serviceDay;
			}
			for (i = 0; i < csvCrewFirstDutyInfoList.size(); ++i) {
				shared_ptr<CREW_FIRST_DUTY_INFO> copy(new CREW_FIRST_DUTY_INFO(*(CREW_FIRST_DUTY_INFO*)csvCrewFirstDutyInfoList[i]));
				if (crewIdMap.find(copy->crewId) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_first_duty_info data, crew=" << copy->crewId << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->crewId];
				crew->crewFirstDutyInfo = copy;
			}

            bidMap.clear();
            bidRequirementMap.clear();
            bidSequenceGroupMap.clear();
			//提前释放crew
			ClearCsvReaderData(CREW, csvCrewList);
			ClearCsvReaderData(CREW_RANK, csvCrewRankList);
			ClearCsvReaderData(CREW_COMPANY_RANK, csvCrewCompanyRankList);
			ClearCsvReaderData(CREW_BASE, csvCrewBaseList);
			ClearCsvReaderData(CREW_FLEET, csvCrewFleetList);
			ClearCsvReaderData(CREW_QUALIFICATION, csvCrewQualList);
			ClearCsvReaderData(CREW_QUALIFICATION, csvCrewCertificateList);
			ClearCsvReaderData(CREW_QUALIFICATION, csvCrewLanguageList);
			ClearCsvReaderData(CREW_QUALIFICATION, csvCrewLicenseList);
			ClearCsvReaderData(CREW_ENTITLEMENT, csvCrewEntitlementList);
			ClearCsvReaderData(CREW_GUARANTEE_HOUR, csvCrewGuaranteeHourList);
			ClearCsvReaderData(CREW_STATUS, csvCrewStatusList);
			ClearCsvReaderData(CREW_TEAM, csvCrewTeamList);
			ClearCsvReaderData(CREW_PREFERENCE, csvCrewPrefList);
			ClearCsvReaderData(CREW_MANDAY_CC_AM, csvCrewMandayList);
			ClearCsvReaderData(CREW_MANDAY_CC_AM, csvPublishCrewMandayList);
			ClearCsvReaderData(CREW_MANDAY_FD, csvCrewMandayFdList);
			ClearCsvReaderData(CREW_MANDAY_FD, csvPublishCrewMandayFdList);
			ClearCsvReaderData(CrewKpiAdjust, csvCrewKpiAdjustList);
			ClearCsvReaderData(CREW_FIRST_DUTY_INFO, csvCrewFirstDutyInfoList);
		}
		////dataCtx.CREW_TEAM_DATA
		//vector<SharedPtr<CREW_TEAM>> crewTeamList;
		//vector<void*> csvCrewTeamList = reader.datas["CrewTeam"];
		//for (i= 0; i < csvCrewTeamList.size(); i++) {
		//	shared_ptr<CREW_TEAM> copy(new CREW_TEAM(*(CREW_TEAM*)csvCrewTeamList[i]));
		//	if (crewIdMap.find(copy->idcrew) == crewIdMap.end()) {
		//		errLog << "ERROR: invalid crew_team data, crew=" << copy->idcrew << " not found" << endl;
		//		continue;
		//	}
		//	shared_ptr<CREW> crew = this->crewIdMap[copy->idcrew];
		//	crew->teamList.push_back(copy);
		//}


		dbg = "COF CREW/CREW_RANK/CREW_COMPANY_RANK/CREW_BASE/CREW_FLEET/CREW_QUALIFICATION/CREW_GUARANTEE_HOUR";
		{
			vector<void*>& csvCrewList = reader.datas["Crew(COF)"];
			vector<void*>& csvCrewRankList = reader.datas["CrewRank(COF)"];
			vector<void*>& csvCrewCompanyRankList = reader.datas["CrewCompanyRank(COF)"];
			vector<void*>& csvCrewBaseList = reader.datas["CrewBase(COF)"];
			vector<void*>& csvCrewFleetList = reader.datas["CrewFleet(COF)"];
			vector<void*>& csvCrewQualList = reader.datas["CrewQualification(COF)"];
			vector<void*>& csvCrewStatusList = reader.datas["CrewStatus(COF)"];
			vector<void*>& csvCrewTeamList = reader.datas["CrewTeam(COF)"];
			vector<void*>& csvCrewGuaranteeHourList = reader.datas["CrewGuaranteeHour(COF)"];
			vector<void*>& csvCrewPrefList = reader.datas["CrewPreference(COF)"];
			vector<void*>& csvCrewProfileList = reader.datas["CrewProfile(COF)"];
			map<string, shared_ptr<CREW>> cofCrewIdMap;
			for (i = 0; i < csvCrewList.size(); i++) {
				string crewId = ((CREW*)csvCrewList[i])->idCrew;
				if (cofCrewIdMap.find(crewId) == cofCrewIdMap.end()) {
					shared_ptr<CREW> crew(new CREW(*(CREW*)csvCrewList[i]));
					cofCrewIdMap[crew->idCrew] = crew;
					this->crewIdMap[crew->idCrew] = crew;
				}
				
				//this->crewList.push_back(crew);
			}
			for (i = 0; i < csvCrewRankList.size(); i++) {
				string crewId = ((CREW_RANK*)csvCrewRankList[i])->idCrew;
				if (cofCrewIdMap.find(crewId) != cofCrewIdMap.end()) {
					shared_ptr<CREW> crew = cofCrewIdMap[crewId];
					shared_ptr<CREW_RANK> copy(new CREW_RANK(*(CREW_RANK*)csvCrewRankList[i]));
					crew->rankList.push_back(copy);
				}
			}
			for (i = 0; i < csvCrewCompanyRankList.size(); i++) {
				string crewId = ((CREW_COMPANY_RANK*)csvCrewCompanyRankList[i])->idCrew;
				if (cofCrewIdMap.find(crewId) != cofCrewIdMap.end()) {
					shared_ptr<CREW> crew = cofCrewIdMap[crewId];
					shared_ptr<CREW_COMPANY_RANK> copy(new CREW_COMPANY_RANK(*(CREW_COMPANY_RANK*)csvCrewCompanyRankList[i]));
					crew->companyRankList.push_back(copy);
				}
			}
			for (i = 0; i < csvCrewBaseList.size(); i++) {
				string crewId = ((CREW_BASE*)csvCrewBaseList[i])->idCrew;
				if (cofCrewIdMap.find(crewId) != cofCrewIdMap.end()) {
					shared_ptr<CREW> crew = cofCrewIdMap[crewId];
					shared_ptr<CREW_BASE> copy(new CREW_BASE(*(CREW_BASE*)csvCrewBaseList[i]));
					crew->baseList.push_back(copy);
				}
			}
			for (i = 0; i < csvCrewFleetList.size(); i++) {
				string crewId = ((CREW_FLEET*)csvCrewFleetList[i])->idCrew;
				if (cofCrewIdMap.find(crewId) != cofCrewIdMap.end()) {
					shared_ptr<CREW> crew = cofCrewIdMap[crewId];
					shared_ptr<CREW_FLEET> copy(new CREW_FLEET(*(CREW_FLEET*)csvCrewFleetList[i]));
					crew->fleetList.push_back(copy);
				}
			}
			for (i = 0; i < csvCrewQualList.size(); i++) {
				if (!((CREW_QUALIFICATION*)csvCrewQualList[i])->isValid) {
					continue;
				}
				string crewId = ((CREW_QUALIFICATION*)csvCrewQualList[i])->idCrew;
				if (cofCrewIdMap.find(crewId) != cofCrewIdMap.end()) {
					shared_ptr<CREW> crew = cofCrewIdMap[crewId];
					shared_ptr<CREW_QUALIFICATION> copy(new CREW_QUALIFICATION(*(CREW_QUALIFICATION*)csvCrewQualList[i]));
					crew->qualificationList.push_back(copy);
					string combQuals = filterQualsByCombsRules();
					if (combQuals.find(copy->qual) != std::string::npos) {
						crew->qualListFiltedByRules[copy->qual] = copy;
					}

					shared_ptr<CREW_QUALIFICATION> copyInDb(new CREW_QUALIFICATION(*(CREW_QUALIFICATION*)csvCrewQualList[i]));
					crew->qualificationListInDb.push_back(copyInDb);
				}
			}
			for (i = 0; i < csvCrewGuaranteeHourList.size(); i++) {
				shared_ptr<CREW_GUARANTEE_HOUR> copy(new CREW_GUARANTEE_HOUR(*(CREW_GUARANTEE_HOUR*)csvCrewGuaranteeHourList[i]));
				if (crewIdMap.find(copy->idCrew) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_guarantee_hour data, crew=" << copy->idCrew << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->idCrew];
				crew->guaranteeHourList.push_back(copy);
			}
			for (i = 0; i < csvCrewStatusList.size(); i++) {
				//20180310 ain, mantis#2931, 修正crewIdMap --> cofCrewIdMap
				shared_ptr<CREW_STATUS> copy(new CREW_STATUS(*(CREW_STATUS*)csvCrewStatusList[i]));
				if (cofCrewIdMap.find(copy->idcrew) == cofCrewIdMap.end()) {
					errLog << "ERROR: invalid crew_status data, crew=" << copy->idcrew << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->idcrew];
				crew->statusList.push_back(copy);
			}
			for (i = 0; i < csvCrewTeamList.size(); i++) {
				
				if (!((CREW_TEAM*)csvCrewTeamList[i])->isValid) {
					continue;
				}
				shared_ptr<CREW_TEAM> copy(new CREW_TEAM(*(CREW_TEAM*)csvCrewTeamList[i]));
				if (cofCrewIdMap.find(copy->idcrew) == cofCrewIdMap.end()) {
					errLog << "ERROR: invalid crew_team data, crew=" << copy->idcrew << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->idcrew];
				copy->teamName = teamObjMap[copy->team_id].team;
				crew->teamList.push_back(copy);
			}
			for (i = 0; i < csvCrewPrefList.size(); i++) {
				shared_ptr<CREW_PREFERENCE> copy(new CREW_PREFERENCE(*(CREW_PREFERENCE*)csvCrewPrefList[i]));
				if (cofCrewIdMap.find(copy->idCrew) == cofCrewIdMap.end()) {
					errLog << "ERROR: invalid crew_pref data, crew=" << copy->idCrew << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->idCrew];
				crew->preferenceList.push_back(copy);
				for (auto crewId : copy->relatedCrewIds){
					if (crewIdMap.find(crewId) == crewIdMap.end()) {
						errLog << "ERROR: invalid crew_pref data, crew=" << crewId << " not found" << endl;
						continue;
					}
					shared_ptr<CREW> relatedcrew = this->crewIdMap[crewId];
					shared_ptr<CREW_PREFERENCE> relatedcopy(new CREW_PREFERENCE(*(CREW_PREFERENCE*)csvCrewPrefList[i]));
					relatedcopy->idCrew = crewId;
					relatedcopy->relatedCrewIds.clear();
					relatedcopy->relatedCrewIds.push_back(copy->idCrew);
					relatedcrew->preferenceList.push_back(relatedcopy);
				}
			}
			for (i = 0; i < csvCrewProfileList.size(); i++) {
				shared_ptr<CREW_PROFILE> copy(new CREW_PROFILE(*(CREW_PROFILE*)csvCrewProfileList[i]));
				if (crewIdMap.find(copy->crewId) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_pref data, crew=" << copy->crewId << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->crewId];
				crew->profiles.push_back(copy);
			}

			//merge to crewIdMap
			map<string, shared_ptr<CREW>>::iterator it;
			for (it = cofCrewIdMap.begin(); it != cofCrewIdMap.end(); it++) {
				if (this->crewIdMap.find(it->first) != this->crewIdMap.end()) {
					//cout << "duplicate crew(cof) " << it->first << endl;
					continue;
				}
				this->crewIdMap[it->first] = it->second;
			}
			//make crewTotalList and avgAnnGuaranteeHourMap
			for (it = this->crewIdMap.begin(); it != this->crewIdMap.end(); it++) {
				this->crewTotalList.push_back(it->second);
				it->second->makeAvgAnnGuaranteeHour();
			}
		}
		//dbg ca_train start by cj
		//map<string, vector<pair<time_t, time_t>>>crewIdToLockPeriods;
		//dbg ca_train end by cj

		dbg = "CREW_FLY_TOGETHER/CREW_FLY_PREFERENCE"; {
			vector<void*>& csvCrewFlyTogetherList = reader.datas["CrewFlyTogether"];
			vector<void*>& csvCrewFlyPreferenceList = reader.datas["CrewFlyPreference"];
			for (i = 0; i < csvCrewFlyTogetherList.size(); i++) {
				shared_ptr<CREW_FLY_TOGETHER> copy(new CREW_FLY_TOGETHER(*(CREW_FLY_TOGETHER*)csvCrewFlyTogetherList[i]));
				if (crewIdMap.find(copy->crewIdA) == crewIdMap.end() || crewIdMap.find(copy->crewIdB) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_fly_together data, crewIdA=" << copy->crewIdA << " crewIdB=" << copy->crewIdB << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crewA = this->crewIdMap[copy->crewIdA];
				crewA->crewFlyTogetherList.push_back(copy);
				shared_ptr<CREW> crewB = this->crewIdMap[copy->crewIdB];
				crewB->crewFlyTogetherList.push_back(copy);
			}
			for (i = 0; i < csvCrewFlyPreferenceList.size(); i++) {
				shared_ptr<CREW_FLY_PREFERENCE> copy(new CREW_FLY_PREFERENCE(*(CREW_FLY_PREFERENCE*)csvCrewFlyPreferenceList[i]));
				if (crewIdMap.find(copy->crewId) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_fly_preference data, crewId=" << copy->crewId << " not found" << endl;
					continue;
				}
				shared_ptr<CREW> crew = this->crewIdMap[copy->crewId];
				crew->crewFlyPreferenceList.push_back(copy);
			}
			ClearCsvReaderData(CREW_FLY_TOGETHER, csvCrewFlyTogetherList);
			ClearCsvReaderData(CREW_FLY_PREFERENCE, csvCrewFlyPreferenceList);
		}
		

		dbg = "Roster";
		loadCsvRoster(this, reader, "Roster");

		//20211011 ain, mantis#9363, RosterGround解析
		dbg = "RosterGround";
		loadCsvRosterGround(this, reader, "RosterGround");

		dbg = "crewId + pairId --> roster";
		map<string, map<long long, shared_ptr<ROSTER>>> crewIdPairingIdToRoster;
		makeIndexCrewIdPairingIdToRoster(this, crewIdPairingIdToRoster);

		//dbg = "make crew roster validity";
		//for (auto it = this->crewIdMap.begin(); it != this->crewIdMap.end(); it++) {
		//	it->second->makeRosterValidity();
		//}

		dbg = "RosterFlight";
		{
			vector<void*>& rosterFlightList = reader.datas["RosterFlight"];
			map<long long, vector<SharedPtr<RosterFlight>>> rosterFlightMap;
			for (i = 0; i < rosterFlightList.size(); i++) {
				SharedPtr<RosterFlight> rf((RosterFlight*)rosterFlightList[i]);
				//20191210 ain, mantis#7251, 问题2, 容忍并打印错误: rosterFlt存在而对应roster不存在
				if (crewIdPairingIdToRoster.find(rf->crewId) == crewIdPairingIdToRoster.end()) {
					cout << "Error: rosterFlt crew=" << rf->crewId << ", flt=" << fltInfo(rf->fltId, this) << ", ptn=" << rf->pairingId << " roster=" << rf->rosterId << ", crewId not found" << endl;
					continue;
				}
				else if (crewIdPairingIdToRoster[rf->crewId].find(rf->pairingId) == crewIdPairingIdToRoster[rf->crewId].end()) {
					cout << "Error: rosterFlt crew=" << rf->crewId << ", flt=" << fltInfo(rf->fltId, this) << ", ptn=" << rf->pairingId << " roster=" << rf->rosterId << ", roster not found" << endl;
					continue;
				}
				else {
					rf->comments = crewIdPairingIdToRoster[rf->crewId][rf->pairingId]->comments;
				}

				vector<SharedPtr<RosterFlight>> list;
				if (rosterFlightMap.find(rf->rosterId) != rosterFlightMap.end()) {
					list = rosterFlightMap[rf->rosterId];
				}
				list.push_back(rf);
				rosterFlightMap[rf->rosterId] = list;

				this->rosterFlightMgr.add(rf);
			}
			//清空csv list, 保留csv读入原始 object, 避免 csvReader释放时 delete
			rosterFlightList.clear(); 
			this->mergeRosterFlight = rosterFlightMap;
		}
		dbg = "crewOnFlight";
		{
			bool cofExits = false;
			vector<void*>& crewOnFlightList = reader.datas["CrewOnFlight"];
			for (i = 0; i < crewOnFlightList.size(); i++) {
				cofExits = false;
				csvCrewOnFlight* obj = (csvCrewOnFlight*)crewOnFlightList[i];
				long long fltId = obj->fltId;
				string crewId = obj->crewId;
				if (fltId == 0) {
					continue;
				}
				if (this->crewIdMap.find(crewId) == crewIdMap.end()) {
					errLog << "ERROR: invalid crew_on_flight data, crew=" << crewId << " not found" << endl;
					continue;
                }
				if (crewOnFlt.find(fltId) == crewOnFlt.end()) {
					crewOnFlt[fltId] = vector<SharedPtr<CrewOnFlight>>();
				}
				// 根据fltId，crewId 判断是否有重复
				const auto& cofs = crewOnFlt[fltId];
				for (const auto& cof : cofs) {
					if (cof->crewId == crewId) {
						cofExits = true;
						break;
					}
				}
				if (cofExits)
					continue;
				SharedPtr<CrewOnFlight> item(new CrewOnFlight);
				item->fltId = fltId;
				item->crewId = crewId;
				item->assignment = obj->assignment;
				item->actingRank = obj->actingRank;
				item->crew = this->crewIdMap[crewId];
				item->pairingId = obj->pairingId;
				item->role = obj->role;
				item->subRole = obj->subRole;
				item->seqOrder = obj->seqOrder;
				item->source = obj->source;

				item->pairingPrimeActivity = obj->pairingPrimeActivity;
				item->dutyId = obj->dutyId;
				item->rosterId = obj->rosterId;
				item->fltDt = obj->fltDt;
				item->division = obj->division;
				item->activeRank = obj->activeRank;
				item->position = obj->position;
				item->checkType = obj->checkType;
				item->tsFlag = obj->tsFlag;
				item->tsFlags = obj->tsFlags;
				item->resourceCode = obj->resourceCode;
				item->groupId = obj->groupId;
				item->tmProgramCourseId = obj->tmProgramCourseId;

				item->parentTmProgramCourseId = obj->parentTmProgramCourseId;
				item->courseCode = obj->courseCode;
				item->isExtraCourse = obj->isExtraCourse;
				item->subTmProgramCourseId = obj->subTmProgramCourseId;
				item->subCourseCode = obj->subCourseCode;
				item->subParentTmProgramCourseId = obj->subParentTmProgramCourseId;

				item->accState = obj->accState;
				item->accTimezone = obj->accTimezone;

				item->isAgreeWork = obj->isAgreeWork;

				item->exceptionCode = obj->exceptionCode;
				item->exceptionCodes = obj->exceptionCodes;
				crewOnFlt[fltId].push_back(item);

			}
			//COP
			map<long long, Pairing*> pairingMap;
			for (Pairing* p : this->pairingList) {
				pairingMap[p->getDbId()] = p;
			}
			for (i = 0; i < crewOnFlightList.size(); i++) {
				csvCrewOnFlight* obj = (csvCrewOnFlight*)crewOnFlightList[i];
				string crewId = obj->crewId;
				std::shared_ptr<CREW> cofCrew = nullptr;
				auto itCrew = this->crewIdMap.find(crewId);
				if (itCrew != this->crewIdMap.end()) {
					cofCrew = itCrew->second;
				}
				long long pairingId = obj->pairingId;
				if (pairingId == 0) {
					continue;
				}
				//mantis#2930, COP中仅需要当前场景pairing
				if (pairingMap.find(pairingId) == pairingMap.end()) {
					//Logger::getRuleLogger()->info("COP skip {}", pairingId);
					continue;
				}

				if (this->crewOnPairing.find(pairingId) == this->crewOnPairing.end()) {
					this->crewOnPairing[pairingId] = list<shared_ptr<CrewOnFlight>>();
				}

				bool alreadyExist = false;
				for (auto& item : crewOnPairing[pairingId]) {
					if (item->crewId == crewId) {
						alreadyExist = true;

						if (obj->assignment == "FLY" || obj->assignment == "OPR") {
							item->fltId = pairingId;
							item->pairingId = pairingId;
							//item->crewId = crewId;
							item->actingRank = obj->actingRank;
							//item->crew = cofCrew;
							item->assignment = obj->pairingPrimeActivity;
							item->role = obj->role;
							item->subRole = obj->subRole;
							item->seqOrder = obj->seqOrder;

							item->pairingPrimeActivity = obj->pairingPrimeActivity;
							item->dutyId = obj->dutyId;
							item->rosterId = obj->rosterId;
							item->fltDt = obj->fltDt;
							item->division = obj->division;
							item->activeRank = obj->activeRank;
							item->position = obj->position;
							item->checkType = obj->checkType;
							item->tsFlag = obj->tsFlag;
							item->tsFlags = obj->tsFlags;
							item->resourceCode = obj->resourceCode;
							item->groupId = obj->groupId;
							item->tmProgramCourseId = obj->tmProgramCourseId;

							item->parentTmProgramCourseId = obj->parentTmProgramCourseId;
							item->courseCode = obj->courseCode;
							item->isExtraCourse = obj->isExtraCourse;
							item->subTmProgramCourseId = obj->subTmProgramCourseId;
							item->subCourseCode = obj->subCourseCode;
							item->subParentTmProgramCourseId = obj->subParentTmProgramCourseId;

							item->accState = obj->accState;
							item->accTimezone = obj->accTimezone;

							item->isAgreeWork = obj->isAgreeWork;

							item->exceptionCode = obj->exceptionCode;
							item->exceptionCodes = obj->exceptionCodes;
						}
						break;
					}
				}
				if (!alreadyExist) {
					SharedPtr<CrewOnFlight> item(new CrewOnFlight);
					item->fltId = pairingId;
					item->pairingId = pairingId;
					item->crewId = crewId;
					item->actingRank = obj->actingRank;
					item->crew = cofCrew;
					item->assignment = obj->pairingPrimeActivity;
					item->role = obj->role;
					item->subRole = obj->subRole;
					item->seqOrder = obj->seqOrder;

					item->pairingPrimeActivity = obj->pairingPrimeActivity;
					item->dutyId = obj->dutyId;
					item->rosterId = obj->rosterId;
					item->fltDt = obj->fltDt;
					item->division = obj->division;
					item->activeRank = obj->activeRank;
					item->position = obj->position;
					item->checkType = obj->checkType;
					item->tsFlag = obj->tsFlag;
					item->tsFlags = obj->tsFlags;
					item->resourceCode = obj->resourceCode;
					item->groupId = obj->groupId;
					item->tmProgramCourseId = obj->tmProgramCourseId;

					item->parentTmProgramCourseId = obj->parentTmProgramCourseId;
					item->courseCode = obj->courseCode;
					item->isExtraCourse = obj->isExtraCourse;
					item->subTmProgramCourseId = obj->subTmProgramCourseId;
					item->subCourseCode = obj->subCourseCode;
					item->subParentTmProgramCourseId = obj->subParentTmProgramCourseId;
					
					item->accState = obj->accState;
					item->accTimezone = obj->accTimezone;

					item->isAgreeWork = obj->isAgreeWork;

					item->exceptionCode = obj->exceptionCode;
					item->exceptionCodes = obj->exceptionCodes;
					crewOnPairing[pairingId].push_back(item);
				}
			}
			ClearCsvReaderData(csvCrewOnFlight, crewOnFlightList);
		}
		dbg = "voyage";
		{
			map<long long, SharedPtr<Voyage>> voyageFltIdMap;
			vector<void*>& csvVoyageList = reader.datas["Voyage"];
			vector<void*>& csvVoyageDetailList = reader.datas["VoyageDetail"];
			for (i = 0; i < csvVoyageList.size(); i++) {
				shared_ptr<Voyage> copy = shared_ptr<Voyage>(new Voyage(*(Voyage*)csvVoyageList[i]));
				this->voyageList.push_back(copy);
				voyageFltIdMap[copy->getFltId()] = copy;
			}
			for (i = 0; i < csvVoyageDetailList.size(); i++) {
				shared_ptr<VoyageDetail> copy = shared_ptr<VoyageDetail>(new VoyageDetail(*(VoyageDetail*)csvVoyageDetailList[i]));
				if (voyageFltIdMap.find(copy->getFltId()) != voyageFltIdMap.end()) {
					voyageFltIdMap[copy->getFltId()]->getDetails().push_back(copy);
				}
			}
		}
		dbg = "FatigueResult";
		{
			vector<void*>& csvFatigueResultList = reader.datas["FatigueResult"];
			for(i = 0; i < csvFatigueResultList.size(); i++) {
				shared_ptr<FatigueResult> copy(new FatigueResult(*(FatigueResult*)csvFatigueResultList[i]));
				//根据copy的rosterId和dutyId，初始化fatigueMap,key是rosterId，value是map，key是dutyId，value是fatigueResult
				this->fatigueMap[copy->rosterId][copy->dutyId] = copy;
			}
		}
		dbg = "Teaching";
		{
			vector<void*>& csvTeachingList = reader.datas["Teaching"];
			vector<void*>& csvTeachingDetailList = reader.datas["TeachingDetail"];
			vector<void*>& csvTeachingHistoryDetailForCACCList = reader.datas["TeachingHistoryDetailForCACC"];
			for (i = 0; i < csvTeachingList.size(); i++) {
				SharedPtr<Teaching> item(new Teaching(*(Teaching*)csvTeachingList[i]));
				if (item->getStatus() == 0)
				{
					this->teachingOfStudent[item->getStudentId()] = item;
				}
				
			}
			for (i = 0; i < csvTeachingDetailList.size(); i++) {
				SharedPtr<TeachingDetail> detail(new TeachingDetail(*(TeachingDetail*)csvTeachingDetailList[i]));
				if (teachingOfStudent.find(detail->getStudentId()) == teachingOfStudent.end()) {
					continue;
				}
				/*for (auto& teaching : teachingOfStudent[detail->getStudentId()]) {
					long long teachingId = atoll(detail->getTeachId().c_str());
					if (teaching->getId() == teachingId) {
						teaching->addDetail(detail);
					}
				}*/
				SharedPtr<Teaching> teaching= teachingOfStudent[detail->getStudentId()];
				string studentId = detail->getStudentId();
				long long teachingId = atoll(detail->getTeachId().c_str());
				if (/*teaching->getStudentId() == studentId&&*/teachingId == teaching->getId()) {
					teaching->addDetail(detail);
				}
			}
			// add cacc history teach detail
			for (std::size_t i = 0; i < csvTeachingHistoryDetailForCACCList.size(); i++)
			{
				SharedPtr<TeachingHistoryDetailForCACC> historyDetail(new TeachingHistoryDetailForCACC(*(TeachingHistoryDetailForCACC*)csvTeachingHistoryDetailForCACCList[i]));
				caccTeachingHistoryDetailsOfStudent[historyDetail->getStudentId()].push_back(historyDetail);
			}
		}
		dbg = "RosterPeriod";
		{
			vector<void*> csvRosterPeriod = reader.datas["RosterPeriod"];
			for (i = 0; i < csvRosterPeriod.size(); i++) {
				RosterPeriod copy = (*((RosterPeriod*)csvRosterPeriod[i]));
				this->rosterPeriodList.push_back(copy);
			}
		}

		dbg = "CrewRpRecency";
		vector<void*> csvCrewRpRecencyList = reader.datas["CrewRpRecency"];
		for (i = 0; i < csvCrewRpRecencyList.size(); i++) {
			CrewRpRecency* obj = static_cast<CrewRpRecency*>(csvCrewRpRecencyList[i]);
			shared_ptr<CrewRpRecency> crewRpRecency = std::make_shared<CrewRpRecency>(*(CrewRpRecency*)csvCrewRpRecencyList[i]);
			this->crewRpRecencyList.emplace_back(crewRpRecency);
		}
		this->crewRpRecencyIndex = std::make_shared<CrewRpRecencyIndex>(this);

		//构建机场距离表
		makeAirportDistanceMap();

		dbg = "DutyCodeTypeComp";
		vector<void*> csvDutyCodeTypeCompList = reader.datas["DutyCodeTypeComp"];
		for (i = 0; i < csvDutyCodeTypeCompList.size(); i++) {
			DutyCodeTypeComp* obj = static_cast<DutyCodeTypeComp*>(csvDutyCodeTypeCompList[i]);
			if (obj->division != scenario.division) continue;
			shared_ptr<DutyCodeTypeComp> dutyCodeTypeComp = std::make_shared<DutyCodeTypeComp>(*(DutyCodeTypeComp*)csvDutyCodeTypeCompList[i]);
			this->dutyCodeTypeCompList.emplace_back(dutyCodeTypeComp);
		}

		dbg = "DutyCodeLogic";
		vector<void*> csvDutyCodeLogicList = reader.datas["DutyCodeLogic"];
		for (i = 0; i < csvDutyCodeLogicList.size(); i++) {
			DutyCodeLogic* obj = static_cast<DutyCodeLogic*>(csvDutyCodeLogicList[i]);
			shared_ptr<DutyCodeLogic> dutyCodeLogic = std::make_shared<DutyCodeLogic>(*(DutyCodeLogic*)csvDutyCodeLogicList[i]);
			this->dutyCodeLogicList.emplace_back(dutyCodeLogic);
		}
		this->dutyCodeLogicMap = makeDutyCodeLogicMap(this->dutyCodeLogicList);

		// init duty code
		initDutyCodeAssignment();

		//mantis#2306, 基于cop计算pairing.comp.fill
		dbg = "cop -> pairing.fill";
		for (i = 0; i < pairingList.size(); i++) {
			pairingList[i]->resetOpenComposition();
		}
		for (auto& copIt : crewOnPairing) {
			long long pairingId = copIt.first;
			if (pairingId == 0)
				continue;
			auto& copOfPairing = copIt.second;
			for (SharedPtr<CrewOnFlight>& cop : copOfPairing) {
				if (pairingIdMap.find(pairingId) != pairingIdMap.end()) {
					Pairing* p = pairingIdMap[pairingId];
					p->fillCompositionRank(cop->actingRank, 1);
				}
				else {
					//cof 引入的 segment可能不属于当前场景pairing
					//Logger::getRuleLogger()->info("ERROR: invalid data, cop pairing={} not found in pairing list", pairingId);
				}
			}
		}
		//mantis#2309, 计算 flight/segment.comp
		dbg = "flight.fill";
		computeFlightSegmentComposition(this->startUtc, flightIdMap, ferryFltIdMap, pairingList);
		dbg = "seg.plan";
		resetSegmentPlanCompByFlt(pairingList, flightIdMap);

		//mantis#2299, 填充 pairingListForRO
		vector<string>& actingRanks = this->scenario.actingRanks;
		vector<string>& bases = this->scenario.bases;
		vector<string>& fleets = this->scenario.fleets;
		vector<string>& assignGrps = this->scenario.assignGrps;
		vector<string> assignments;
		vector<string>& paList = this->scenario.pairingAttributes;
		vector<string>& tagList = this->scenario.pairingTags;
		for (string group : assignGrps) {
			for (string item : this->getRule8014AssignmentsByGrps(group))
				assignments.push_back(item);
		}
		stringstream ss;
		ss << "Assignments : ";
		for (string item : assignments) {
			ss << item << " ";
		}
		Logger::getRuleLogger()->debug(ss.str());
		Logger::getRuleLogger()->debug("scenario.start={} scenario.end={}", utcToUtcString(scenario.startDtUTC), utcToUtcString(scenario.endDtUTC));
		vector<string> assignGrpsOfMvoMvp = { "MVO", "MVP" };
		map<long long, bool> includedPairingId;

		//按场景star/end/base/rank/fleet/assignment筛选pairing
		for (Pairing* p : pairingList) {
			bool rankMatch = false;
			bool baseMatch = false;
			bool fleetMatch = false;
			bool assignMatch = false;
			bool pairingAttrMatch = false;
			bool pairingTagMatch = false;
			for (auto &rankValue : p->getComplements()) {
				if (actingRanks.end() != std::find(actingRanks.begin(), actingRanks.end(), rankValue.first))
					rankMatch = true;
			}
			if (bases.end() != std::find(bases.begin(), bases.end(), p->getBase())) {
				baseMatch = true;
			}
			if (p->getPrimeActivity() == "MVP") {
				fleetMatch = true;
			}
			for (auto s : p->getSegments()) {
				if (fleets.end() != std::find(fleets.begin(), fleets.end(), s->getFleetCD())) {
					fleetMatch = true;
					break;
				}
			}
			time_t flyStartTime = p->getStartTimeUtc();
			//场景时间+场景assignment 或 后续5天+mvo/mvp
			if (flyStartTime >= scenario.startDtUTC && flyStartTime < scenario.endDtUTC + 24 * 3600) {
				if (assignments.empty() || isContains(assignments, p->getPrimeActivity()))
					assignMatch = true;
			}
			//20180325 ain, mantis#2970, pairingListForRo增加筛选 pairingAttr
			if (paList.empty()) {
				pairingAttrMatch = true;
			}
			if (tagList.empty()) {
				pairingTagMatch = true;
			}
			if (scenario.airline == "CA")
			{
				for (string& pa : paList) {
					if (/*p->getPGAttribute().empty() || */p->getAttribute().find(pa) != string::npos) {
						pairingAttrMatch = true; break;
					}
				}
			}
			else
			{
				for (string& pa : paList) {
					if (p->getAttribute().empty() || p->getAttribute().find(pa) != string::npos) {
						pairingAttrMatch = true; break;
					}
				}
			}

			if (rankMatch && baseMatch && fleetMatch && assignMatch && pairingAttrMatch) {
				if (includedPairingId.find(p->getDbId()) == includedPairingId.end()) {
					this->pairingListForRO.push_back(p);
					includedPairingId[p->getDbId()] = true;
				}
			}
		}
		//20181013 ain, mantis#4214, MVO/MVP筛选按是否制定CMT, 不再判断airline
		//20181019 ain, mantis#4214, MVO/MVP按leadout+5天筛选
		//筛选leadout mvo/mvp
		int leadoutMvoMvpCount = 0;
		int LEADOUT_ROSTER_DAYS = 8;
		if (systemParamMap.find("DEFAULT_LEADOUT_DAYS_POST_ROSTER_PERIOD") != systemParamMap.end()) {
			LEADOUT_ROSTER_DAYS = atoi(systemParamMap["DEFAULT_LEADOUT_DAYS_POST_ROSTER_PERIOD"].c_str());
		}
		int LEADOUT_MVO_MVP_DAYS = LEADOUT_ROSTER_DAYS + 5;
		if ((scenario.category == "RO" || scenario.category == "TO") && isContains(scenario.assignGrps, "CMT")) {
			for (Pairing* p : pairingList) {
				bool rankMatch = false;
				bool baseMatch = false;
				bool fleetMatch = false;
				bool assignMatch = false;
				for (auto &rankValue : p->getComplements()) {
					if (actingRanks.end() != std::find(actingRanks.begin(), actingRanks.end(), rankValue.first))
						rankMatch = true;
				}
				if (bases.end() != std::find(bases.begin(), bases.end(), p->getBase())) {
					baseMatch = true;
				}
				if (p->getPrimeActivity() == "MVP") {
					fleetMatch = true;
				}
				for (auto s : p->getSegments()) {
					if (fleets.end() != std::find(fleets.begin(), fleets.end(), s->getFleetCD())) {
						fleetMatch = true;
						break;
					}
				}
				//场景时间+场景assignment 或 后续5天+mvo/mvp
				if (p->getStartTimeUtc() >= scenario.endDtUTC + 24 * 3600 && p->getStartTimeUtc() < scenario.endDtUTC + (LEADOUT_MVO_MVP_DAYS + 1) * 24 * 3600) {
					if (isContains(assignGrpsOfMvoMvp, p->getPrimeActivity())) {
						assignMatch = true;
					}
				}
				if (rankMatch && baseMatch && fleetMatch && assignMatch) {
					if (includedPairingId.find(p->getDbId()) == includedPairingId.end()) {
						leadoutMvoMvpCount++;
						includedPairingId[p->getDbId()] = true;
						this->pairingListForRO.push_back(p);
					}
				}
			}
		}
		//筛选pairing，选取openComposition不为空的部分
		vector<string>& scenarioRanks = scenario.actingRanks;
		for (Pairing* p : pairingListForRO) {
			map<string, int> &openComp = p->getOpenComposition();
			//mantis#2299, 按scenarioRank筛选open
			for (string& rank : scenarioRanks) {
				map<string, int>::iterator it = openComp.find(rank);
				if (it != openComp.end()) {
					if (openComp[rank] > 0) {
						pairingListForROWithOpenComposition.push_back(p);
						break;
					}
				}
			}
		}
		Logger::getRuleLogger()->info("pairingList.size = {}", pairingList.size());
		Logger::getRuleLogger()->info("pairingListForRO.size = {}", pairingListForRO.size());
		Logger::getRuleLogger()->info("leadout {} days mvo/mvp.size = {}", LEADOUT_MVO_MVP_DAYS, leadoutMvoMvpCount);
		Logger::getRuleLogger()->info("pairingListForRoWithOpenComposition.size = {}", pairingListForROWithOpenComposition.size());
		
		dbg = "Holiday";
		{
			vector<void*> csvHoliday = reader.datas["Holiday"];
			for (i = 0; i < csvHoliday.size(); i++) {
				Holiday* copy = new Holiday(*((Holiday*)csvHoliday[i]));
				this->holidays.push_back(shared_ptr<Holiday>(copy));
			}
		}

		dbg = "guaranteeFlyHours";
		{
			vector<void*>& csvGuaranteeFlyHours = reader.datas["GuaranteeFlyHours"];

			for (i = 0; i < csvGuaranteeFlyHours.size(); i++) {
				GuaranteeFlyHours* guaranteeFlyHours = new GuaranteeFlyHours(*((GuaranteeFlyHours*)csvGuaranteeFlyHours[i]));
				guaranteeFlyHoursList.push_back(std::make_shared<GuaranteeFlyHours>(*guaranteeFlyHours));
			}
			makeCrewGuaranteeFlyHours();
		}

		//clear csvReader.datas, free memory
		Logger::getRuleLogger()->info("clear csv reader...");
		reader.clear();

		//按crewBase.loc计算utc
		resetCrewBaseUtcByLoc(this);

		//init index
		dbg = "crewBaseIndex";
		makeIndexCrewBaseRankFleet(this);

		//创建 crewKpiAdjust index
		dbg = "crewKpiAdjustTimeIndex";
		makeIndexCrewKpiAdjust(this);

		//若system_param[CREW_MANDAY_STORE_TIMEZONE]=CREW_BASE, 则需要修正manday.utc
		dbg = "resetCrewMandayLocalToUtc";
		resetCrewMandayDateToUtc(this);

		//sort crew_base/rank/fleet/qual/...
		dbg = "sort crew";
		sortCrewData(crewTotalList);
		filterCrewDataByPeriod(this, this->crewIdMap);    //按 scenario.start/end筛选 crew_base/fleet/rank/qual
		resetCrewRankFleetQualLocalTimeToUtc(this);
		std::stable_sort(crewList.begin(), crewList.end(), [](const SharedPtr<CREW>& i, const SharedPtr<CREW>& j) {return i->idCrew.compare(j->idCrew) < 0; }); //20180211 ain, 排序, 确保 input_crew.txt顺序一致

		dbg = "make crew roster validity";
		for (auto it = this->crewIdMap.begin(); it != this->crewIdMap.end(); it++) {
			it->second->makeRosterValidity();
		}

		//process holiday local to utc
		resetHolidayLocalTimeToUtc(this);

		//OP#1834, index, flt->pairing, pairingId->pairing
		//flt_id --> pairing_id
		dbg = "index flt to pairing";
		makeFltToPairingMapIndex(this->pairingList, this->fltToPairingMap);
		//pairingIdMap
		dbg = "index pairing_id to pairing";
		for (auto& p : pairingList) {
			this->pairingIdMap[p->getDbId()] = p;
		}

		//pairingLabel->Pairing
		dbg = "index pairingLabel to pairing";
		makePairingLabelMapIndex(this->pairingList, this->pairingLabelMap);

		//jx.jin 3.0 补充roster缺失字段
		if (version == 3) {
			fixRosterByPairing(this);
		}

		//OP#1932, ro loadData 计算 rankCombination
		if (this->version != 3) {
			calculatePairingListRankCombination(pairingList, this);
		}
		customBizLoadData(this);
		//check
		dbg = "check assignment";
		checkAssignment(this);
		dbg = "check systemParameter";
		checkSystemParameterDefaultTimezone(this);
		dbg = "check roster";
		checkRoster(this);

		//2023-07-11，移除此部分，从ro_input.txt中直接读取Recency数据
		//计算本场景recency
		//dbg = "computeRecency"; Logger::getRuleLogger()->info("{}", dbg.c_str());
		//computeCrewRecency(this, this->scenarioId, "ROIS");

		//20201110 ain, mantis#8798, 补齐缺失的rosterFlt, 确保8072等依赖rosterFlt的法规执行正常
		fixRosterFlight(this);

		//20200812 ain, mantis#8564, 按roster补齐rosterFLt，号位默认0，针对旧场景流程缺少rosterFlt数据
		fixDataMissingRosterFlight(this);

		//20180917 ain, OP#1896, merge crew_rank
		for (auto& it : crewIdMap) {
			
			mergeCrewRank(it.second->rankList);
			mergeCrewCompanyRank(it.second->companyRankList);
			mergeCrewQualification(it.second->qualificationList);
			mergeCrewStatus(it.second->statusList);
		}

		//20201109 ain, mantis#8798, RO场景缺失rosterFlt补齐逻辑
		//////////////////////////////////////////////////////////
		if (CREW_APP_TYPE_OR == this->applicationType && this->configInputLog) {
			dbg = "test_file";
			test_file_rule(this->ruleList, "ro_input_rule.txt");
			test_file_rule(this->cqfList2, "ro_input_cqf.txt");
			test_file_assignment(this->totalAssignmentIdMap, "ro_input_assignment.txt");
			test_file_assignment_grp_val(this->assignmentNameGroupMap, "ro_assignment_map.txt");
			test_file_pairing(this->pairingList, "ro_input_pairing.txt");
			test_file_pairing(this->pairingListForRO, "ro_input_pairing_for_ro.txt");
			test_file_pairing(pairingListForROWithOpenComposition, "ro_input_pairing_for_ro_with_open.txt");
			test_file_holiday(this->holidays, "ro_input_holiday.txt");
			test_file_roster(this->rosterList, "ro_input_roster.txt");
			{
				vector<SharedPtr<ROSTER>> rosterFromScenarioGrpList;
				for (auto& r : this->rosterList) {
					if (r->isFromGroupBrotherScenario(otherScenarioInSameGroup))
						rosterFromScenarioGrpList.push_back(r);
				}
				test_file_roster(this->rosterList, "input_roster_from_scenario_grp.txt");
			}

			test_file_cross_rank_rule(this->crossRankRuleList, "ro_rule_cross_rank.txt");
			test_file_rule_8014(this->rule_8014, "ro_rule_8014.txt");
			test_file_crew(this->crewList, "ro_input_crew.txt");
			//test_file_crew(this->crewTotalList, "ro_input_crew_cof.txt");
			//test_file_crew(this->crewOfCofList, "ro_input_crew_cof.txt");
			test_file_crew_on_flight2(this->crewOnFlt, "test_cof_on_flt.txt");
			test_file_crew(this->crewTotalList, "ro_input_crew_total.txt");
			test_file_manday(this->crewList, "ro_input_manday.txt", false);
			test_file_manday(this->crewList, "ro_input_manday_publish.txt", true);

			test_file_port_dual_reqmnt(this->portQualReqmnts);
			test_file_port_dual_reqmnt_map(this->portQualReqmntsAirportMap);

			test_file_crew_on_pairing(this->crewOnPairing, "ro_input_cop.txt");
			//test_file_assignment(this->totalAssignmentIdMap, "ro_input_total_assignment.txt");
			//test_file_crew_recency(this->crewRecencyMap, "ro_crew_recency.txt");
			
			success = true;
		}
		//////////////////////////////////////////////////////////
		
		//检查数据
		dbg = "check data";
		if (!dataChecker.checkIsPrimeBase(this->crewList)) {
			Logger::getRuleLogger()->error("checkIsPrimeBase invalid data, dgb={}", dbg);
		}
		if (!dataChecker.checkDutyEmpty(this->pairingList)) {
			Logger::getRuleLogger()->error("checkDutyEmpty invalid data, dgb={}", dbg);
		}
		if (!dataChecker.checkCrewRank(this->crewList)) {
			Logger::getRuleLogger()->error("checkCrewRank invliad data, dgb={}", dbg);
		}
		//
		Logger::getRuleLogger()->info("loadDataCsv end");
		success = true;
	}
	CATCH_EXCEPTIONS("loadDataCsv");

	if (errLog.is_open())
		errLog.close();
	
	if (!success) {
		//20200831 ain, 数据检查错误不终止流程, 只打印警告
		//Logger::getRuleLogger()->error("load data fail");
		Logger::getRuleLogger()->error("ERROR: load data fail\n");
	}
	return errorCode;
}

int CrewDataContext::saveRoCsv(const char * filepath) {
	int errorCode = 0;
	int i = 0, j = 0;
	string dbg = "";
	ofstream outfile(filepath, std::ios_base::binary | std::ios_base::out);
	ofstream errLog;
	try {
		test_file_crew(this->crewList, "ro_output_crew.txt");

		Logger::getRuleLogger()->info("saveRoCsv start");
		errLog.open("err.log");

		//read csv
		dbg = "reader.";
		crewCsvReader reader;
		
		//scenario
		dbg = "Scenario";
		shared_ptr<csvParser> scenarioParser = reader.getParser("Scenario");
		vector<void*> dataScenarioList;
		dataScenarioList.push_back(&this->scenario);
		reader.write(outfile, "Scenario", dataScenarioList, scenarioParser);

		//roster
		//make copy for each roster of result (0 or current scenario)
		dbg = "Roster";
		saveRosterToCsv(outfile, reader, this);
		//20201110 mantis#8798 问题一 out_put 增加RosterFlight输出
		dbg = "RosterFlight";
		vector<long long> flightIds;
		saveRosterFlightToCsvStream(outfile, this->startUtc, this->endUtc, flightIds, reader, this);
		//20181223 ain, mantis#4694, saveRo保存manday参数为scenario.start/end loc
		//CrewMandayCcAm
		dbg = "CrewManday";
		string defaultAirport = this->systemParamMap["CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE"];
		int timezoneOffsetMinutes = this->getAirportOffsetMinutes(defaultAirport);
		saveMandayToCsvStream(outfile, this->startUtc + (time_t)(timezoneOffsetMinutes * 60), this->endUtc + (time_t)(timezoneOffsetMinutes * 60), reader, this);
		
		//ak crewmemo
		dbg = "crewmemo";
		
		int count = 0;
		for (auto& obj : this->crewIdToPhaseToPeriodsForAK)
		{
			map<string, pair<string, string>> phaseToPeriods = obj.second;
			for (auto& obj2 : phaseToPeriods)
			{
				count++;			
			}
		}
		if (crewIdToPhaseToPeriodsForAK.size() == 0)
		{
			count = 1;
		}
		outfile << "------CrewMemo" << "(" << count << "):" << "crewId" <<","<<"id"<<","<<"strDtLoc" <<"," << "endDtLoc" << "," << "memo" << "," << "userId" 
			<<","<<"tmst"<<","<<"status"<<","<<"rosterId"<< endl;
		if (crewIdToPhaseToPeriodsForAK.size() == 0)
			outfile << "0000016005" << "^" <<""<<"^"<< "2019-11-10" << "^" << "2019-11-15" << "^" << "FINAL CHECK"<<"^"<<""<<"^"<<""<<"^"<<""<<"^"<<"" << endl;
		for (auto& obj : this->crewIdToPhaseToPeriodsForAK)
		{
			string crewId = obj.first;
			map<string, pair<string, string>> phaseToPeriods = obj.second;
			for (auto& obj2 : phaseToPeriods)
			{
				string phase = obj2.first;
				string startTime = obj2.second.first;
				string endTime = obj2.second.second;
				//outfile << crewId << "^" << startTime << "^" << endTime << "^" << phase << endl;
				outfile << crewId << "^" << "" << "^" << startTime << "^" << endTime << "^" << "FINAL CHECK" << "^" << "" << "^" << "" << "^" << "" << "^" << "" << endl;
			}
		}

        dbg = "Bidding";
        saveBiddingResultsToCsv(outfile, reader, this);
	}
	catch (exception& ex) {
		cout << "ERROR: saveRoCsv failed " << ex.what() << ", dbg=" << dbg << " i=" << i << endl;
	}
	if (errLog.is_open())
		errLog.close();
	if (outfile.is_open())
		outfile.close();
	return errorCode;
}

int CrewDataContext::saveScenarioCsv(const char * filepath) {

	int errorCode = 0;
	string dbg = "";
	std::size_t i = 0;
	ofstream outfile(filepath, std::ios_base::binary | std::ios_base::out);
	ofstream errLog;
	try {

		Logger::getRuleLogger()->info("saveScenarioCsv start");
		Logger::getRuleLogger()->info("csv-file: {}", filepath);
		errLog.open("err.log");

		//read csv
		dbg = "reader.";
		crewCsvReader reader;

		//scenario
		dbg = "Scenario";
		{
			shared_ptr<csvParser> scenarioParser = reader.getParser("Scenario");
			vector<void*> dataScenarioList;
			dataScenarioList.push_back(&this->scenario);
			reader.write(outfile, "Scenario", dataScenarioList, scenarioParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "Attribute";
		{
			string name = "Attribute";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector <void*> csvList;
			for (auto& it : this->attributeIdMap) {
				csvAttribute * obj = new csvAttribute();
				obj->airline = it.second.airline;
				obj->code = it.second.code;
				obj->id = it.second.id;
				obj->type = it.second.type;
				obj->operation = it.second.operation;
				csvList.push_back(obj);
			}
			reader.write(outfile, name, csvList, csvParser);
			CLEANUP_CSV_LIST(csvList);
		}
		dbg = "Airport";
		{
			string name = "Airport";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector <void*> csvList;
			//airpot 索引
			if (airportCodeMap.empty()) {
				for (i = 0; i < this->airportList.size(); i++) {
					airportCodeMap[airportList[i].airport] = &airportList[i];
				}
			}
			//根据 segment/flight筛选airport
			map<string, bool> usedAirport;
			for (auto& p : this->pairingList) {
				for (std::size_t m = 0; m < p->getNumDuties(); m++) {
					Duty * d = p->getDuty(m);
					for (std::size_t n = 0; n < d->getNumSegments(); n++) {
						Segment * s = d->getSegment(n);
						usedAirport[s->getDepStation()] = true;
						usedAirport[s->getArrStation()] = true;
					}
				}
			}
			//根据 crew_base筛选airport
			for (auto& it : this->crewIdMap) {
				for (auto& crewbase : it.second->baseList) {
					usedAirport[crewbase->base] = true;
				}
			}
			for (auto& entry : usedAirport) {
				string airportName = entry.first;
				if (airportCodeMap.find(airportName) == airportCodeMap.end()) {
					Logger::getRuleLogger()->error("ERROR: airport={} not found", airportName.c_str());
				}
				else {
					csvList.push_back(airportCodeMap[airportName]);
				}
		
			}
			reader.write(outfile, name, csvList, csvParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "Crew";
		{
			shared_ptr<csvParser> crewParser = reader.getParser("Crew");
			vector <void*> csvCrewList;
			for (auto& crew : this->crewList) {
				csvCrewList.push_back(crew.get());
			}
			reader.write(outfile, "Crew", csvCrewList, crewParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "CrewRank";
		{
			string name = "CrewRank";
			shared_ptr<csvParser> crewRankParser = reader.getParser(name);
			vector <void*> csvCrewRankList;
			for (auto& crew : this->crewList) {
				for (auto& cr : crew->rankList)
					csvCrewRankList.push_back(cr.get());
			}
			reader.write(outfile, name, csvCrewRankList, crewRankParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "CrewCompanyRank";
		{
			string name = "CrewCompanyRank";
			shared_ptr<csvParser> crewCompanyRankParser = reader.getParser(name);
			vector <void*> csvCrewCompanyRankList;
			for (auto& crew : this->crewList) {
				for (auto& ccr : crew->companyRankList)
					csvCrewCompanyRankList.push_back(ccr.get());
			}
			reader.write(outfile, name, csvCrewCompanyRankList, crewCompanyRankParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "CrewFleet";
		{
			string name = "CrewFleet";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector <void*> csvList;
			for (auto& crew : this->crewList) {
				for (auto& cr : crew->fleetList)
					csvList.push_back(cr.get());
			}
			reader.write(outfile, name, csvList, csvParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "CrewBase";
		{
			string name = "CrewBase";
			
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector <void*> csvList;
			for (auto& crew : this->crewList) {
				for (auto& cr : crew->baseList)
					csvList.push_back(cr.get());
			}
			reader.write(outfile, name, csvList, csvParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "CrewQualification";
		{
			string name = "CrewQualification";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector <void*> csvList;
			for (auto& crew : this->crewList) {
				for (auto& cr : crew->qualificationList)
					csvList.push_back(cr.get());
			}
			reader.write(outfile, name, csvList, csvParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "CrewPreference";
		{
			string name = "CrewPreference";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector <void*> csvList;
			for (auto& crew : this->crewList) {
				for (auto& cr : crew->preferenceList)
					csvList.push_back(cr.get());
			}
			reader.write(outfile, name, csvList, csvParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "CrewGuaranteeHour";
		{
			string name = "CrewGuaranteeHour";
			shared_ptr<csvParser> crewCrewGuaranteeHourParser = reader.getParser(name);
			vector <void*> csvCrewGuaranteeHourList;
			for (auto& crew : this->crewList) {
				for (auto& gh : crew->guaranteeHourList)
					csvCrewGuaranteeHourList.push_back(gh.get());
			}
			reader.write(outfile, name, csvCrewGuaranteeHourList, crewCrewGuaranteeHourParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "CrewProfile";
		{
			string name = "CrewProfile";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector <void*> csvList;
			for (auto& crew : this->crewList) {
				for (auto& item : crew->profiles)
					csvList.push_back(item.get());
			}
			reader.write(outfile, name, csvList, csvParser);
		}
		dbg = "CrewStatus";
		{
			string name = "CrewStatus";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector <void*> csvList;
			for (auto& crew : this->crewList) {
				for (auto& cr : crew->statusList)
					csvList.push_back(cr.get());
			}
			reader.write(outfile, name, csvList, csvParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "CrewOnFlight";
		{
			string name = "CrewOnFlight";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector <void*> csvList;
			for (auto& fltEntry : this->crewOnFlt) {
				for (auto& cof : fltEntry.second) {
					csvCrewOnFlight * csvData = new csvCrewOnFlight;
					csvData->fltId = cof->fltId;
					csvData->actingRank = cof->actingRank;
					csvData->crewId = cof->crewId;
					csvData->pairingId = cof->pairingId;
					csvData->assignment = cof->assignment;
					csvList.push_back(csvData);
				}
			}
			reader.write(outfile, name, csvList, csvParser);
			CLEANUP_CSV_LIST(csvList);
		}

		//CREW of COF
		map<string, shared_ptr<CREW>> scenarioCrewMap;
		for (auto& c : this->crewList) {
			scenarioCrewMap[c->idCrew] = c;
		}
		vector<shared_ptr<CREW>> cofCrewList;
		for (auto& c : this->crewIdMap) {
			if (scenarioCrewMap.find(c.first) == scenarioCrewMap.end())
				cofCrewList.push_back(c.second);
		}
		dbg = "Crew(COF)";
		{
			string name = "Crew(COF)";
			shared_ptr<csvParser> crewParser = reader.getParser(name);
			vector <void*> csvCrewList;
			for (auto& crew : cofCrewList) {
				csvCrewList.push_back(crew.get());
			}
			reader.write(outfile, name, csvCrewList, crewParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "CrewRank(COF)";
		{
			string name = "CrewRank(COF)";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector <void*> csvList;
			for (auto& crew : cofCrewList) {
				for (auto& cr : crew->rankList)
					csvList.push_back(cr.get());
			}
			reader.write(outfile, name, csvList, csvParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "CrewCompanyRank(COF)";
		{
			string name = "CrewCompanyRank(COF)";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector <void*> csvList;
			for (auto& crew : cofCrewList) {
				for (auto& ccr : crew->companyRankList)
					csvList.push_back(ccr.get());
			}
			reader.write(outfile, name, csvList, csvParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "CrewFleet(COF)";
		{
			string name = "CrewFleet(COF)";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector <void*> csvList;
			for (auto& crew : cofCrewList) {
				for (auto& cr : crew->fleetList)
					csvList.push_back(cr.get());
			}
			reader.write(outfile, name, csvList, csvParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "CrewBase(COF)";
		{
			string name = "CrewBase(COF)";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector <void*> csvList;
			for (auto& crew : cofCrewList) {
				for (auto& cr : crew->baseList)
					csvList.push_back(cr.get());
			}
			reader.write(outfile, name, csvList, csvParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "CrewQualification(COF)";
		{
			string name = "CrewQualification(COF)";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector <void*> csvList;
			for (auto& crew : cofCrewList) {
				for (auto& cr : crew->qualificationList)
					csvList.push_back(cr.get());
			}
			reader.write(outfile, name, csvList, csvParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "CrewGuaranteeHour(COF)";
		{
			string name = "CrewGuaranteeHour(COF)";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector <void*> csvList;
			for (auto& crew : cofCrewList) {
				for (auto& gh : crew->guaranteeHourList)
					csvList.push_back(gh.get());
			}
			reader.write(outfile, name, csvList, csvParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "CrewPreference(COF)";
		{
			string name = "CrewPreference(COF)";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector <void*> csvList;
			for (auto& crew : cofCrewList) {
				for (auto& cr : crew->preferenceList)
					csvList.push_back(cr.get());
			}
			reader.write(outfile, name, csvList, csvParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "CrewProfile(COF)";
		{
			string name = "CrewProfile(COF)";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector <void*> csvList;
			for (auto& crew : this->crewList) {
				for (auto& item : crew->profiles)
					csvList.push_back(item.get());
			}
			reader.write(outfile, name, csvList, csvParser);
		}
		dbg = "CrewStatus(COF)";
		{
			string name = "CrewStatus(COF)";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector <void*> csvList;
			for (auto& crew : cofCrewList) {
				for (auto& cr : crew->statusList)
					csvList.push_back(cr.get());
			}
			reader.write(outfile, name, csvList, csvParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		//recency
		dbg = "CrewRecency";
		{
			string name = "CrewRecency";
			shared_ptr<csvParser> parser = reader.getParser(name);
			vector<void*> csvList;
			for (auto& recencyOfCrew : this->recencyMgr.getRecencyMap()) {
				for (auto& recencyClass : recencyOfCrew.second) {
					for (auto& recency : recencyClass.second) {
						csvList.push_back(recency.get());
					}
				}
			}
			reader.write(outfile, name, csvList, parser);
		}
		//roster
		dbg = "Roster";
		{
			shared_ptr<csvParser> rosterParser = reader.getParser("Roster");
			vector<void*> rosterList;
			for (i = 0; i < this->crewList.size(); i++) {
				shared_ptr<CREW> crew = this->crewList[i];
				for (std::size_t j = 0; j < crew->rosterList.size(); j++) {
					rosterList.push_back(crew->rosterList[j].get());
				}
			}
			reader.write(outfile, "Roster", rosterList, rosterParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "Pairing";
		{
			long long tmpId = -1;
			string name = "Pairing";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector<void*> csvList;
			for (i = 0; i < this->pairingList.size(); i++) {
				if (pairingList[i]->getDbId() == 0)
					pairingList[i]->setDbId(tmpId--);
				csvList.push_back(pairingList[i]);
			}
			reader.write(outfile, name, csvList, csvParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "PairingRankValue";
		{
			string name = "PairingRankValue";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector<void*> csvList;
			for (i = 0; i < this->pairingList.size(); i++) {
				for (auto& entry : pairingList[i]->getComplements()) {
					csvRankValue * copy = new csvRankValue;
					copy->activityId = pairingList[i]->getDbId();
					copy->rank = entry.first;
					copy->value = entry.second;
					csvList.push_back(copy);
				}
			}
			reader.write(outfile, name, csvList, csvParser);
			CLEANUP_CSV_LIST(csvList);
		}
		dbg = "PairingDuty";
		{
			long long tmpId = -1;
			string name = "PairingDuty";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector<void*> csvList;
			for (i = 0; i < this->pairingList.size(); i++) {
				Pairing* p = this->pairingList[i];
				for (std::size_t j = 0; j < p->getNumDuties(); j++) {
					if (p->getDuty(j)->getDutyId() == 0)
						p->getDuty(j)->setDutyId(tmpId--);
					csvList.push_back(p->getDuty(j));
				}
			}
			reader.write(outfile, name, csvList, csvParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "PairingSegment";
		{
			long long tmpId = -1;
			string name = "PairingSegment";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector<void*> csvList;
			for (i = 0; i < this->pairingList.size(); i++) {
				Pairing* p = this->pairingList[i];
				for (std::size_t j = 0; j < p->getNumDuties(); j++) {
					Duty * d = p->getDuty(j);
					for (std::size_t k = 0; k < d->getNumSegments(); k++) {
						if (d->getSegment(k)->getSegmentId() == 0)
							d->getSegment(k)->setSegmentId(tmpId--);
						csvList.push_back(d->getSegment(k));
					}
				}
			}
			reader.write(outfile, name, csvList, csvParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		//20190922 ain, mantis#6741, #5, change_flight流程 save保存dutyNode
		dbg = "PairingDutyNode";
		{
			fixPairingDuty(this); //修正PairingDutyNode可能错误

			shared_ptr<csvParser> dutyNodeParser = reader.getParser("PairingDutyNode");
			vector<void*> csvDutyNodeList;
			for (Pairing* p : pairingList) {
				for (Duty* d : p->getDutyVec()){
					for (shared_ptr<PairingDutyNode> node : d->pairingDutyNodes) {
						csvDutyNodeList.push_back(node.get());
					}
				}
			}
			reader.write(outfile, "PairingDutyNode", csvDutyNodeList, dutyNodeParser);
		}
		map<long long, Segment*> flightIdMap;
		dbg = "Flight";
		{
			string name = "Flight";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector<void*> csvList;
			map<long long, shared_ptr<Segment>> flightIdMap;
			for (shared_ptr<Segment> flt : flightList) {
				flightIdMap[flt->getDBId()] = flt;
				csvList.push_back(flt.get());
			}
			//根据pairingSegment添加未包含与 flightList的 flt
			for (i = 0; i < this->pairingList.size(); i++) {
				Pairing* p = this->pairingList[i];
				for (std::size_t j = 0; j < p->getNumDuties(); j++) {
					Duty * d = p->getDuty(j);
					for (std::size_t k = 0; k < d->getNumSegments(); k++) {
						Segment * s = d->getSegment(k);
						if (s->getDBId() != 0 && flightIdMap.find(s->getDBId()) == flightIdMap.end()) {
							if (s->getDBId() != 0 && flightIdMap.find(s->getDBId()) == flightIdMap.end()) {
								flightIdMap[s->getDBId()] = shared_ptr<Segment>(new Segment(*s));
								csvList.push_back(s);
							}
						}
					}
				}
			}
			reader.write(outfile, name, csvList, csvParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "FlightRankValue";
		{
			string name = "FlightRankValue";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector<void*> csvList;
			for (auto& flt : flightIdMap) {
				for (auto& entry : flt.second->getPlanComposition()) {
					csvRankValue * copy = new csvRankValue;
					copy->activityId = flt.first;
					copy->rank = entry.first;
					copy->value = entry.second;
					csvList.push_back(copy);
				}
			}
			reader.write(outfile, name, csvList, csvParser);
			CLEANUP_CSV_LIST(csvList);
		}
		dbg = "FlightAttribute";
		{
			string name = "FlightAttribute";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector<void*> csvList;

			//创建 code -> attribute map，优先 type=ROUTE,其次type=PAIRING
			map<string, ATTRIBUTE> codeMap;
			for (auto& it : this->attributeIdMap) {
				string code = it.second.code;
				if (codeMap.find(code) == codeMap.end()) {
					codeMap[code] = it.second;
				}
				else {
					if (codeMap[code].type == "PAIRING" && it.second.type == "ROUTE")
						codeMap[code] = it.second;
				}
			}

			for (auto& flt : flightIdMap) {
				auto& fltAttr = flt.second->getAttributes();
				if (fltAttr.empty())
					continue;
				for (string attrCode : fltAttr) {
					if (codeMap.find(attrCode) != codeMap.end()) {
						ATTRIBUTE& attr = codeMap[attrCode]; 
						csvAttribute * obj = new csvAttribute;
						obj->airline = attr.airline;
						obj->code = attr.code;
						obj->id = attr.id;
						obj->type = attr.type;
						obj->operation = attr.operation;
						csvList.push_back(obj);
					}
				}
			}
			reader.write(outfile, name, csvList, csvParser);
			CLEANUP_CSV_LIST(csvList);

		}
		dbg = "AssignmentGroup";
		{
			string name = "AssignmentGroup";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector<void*> csvList;
			for (auto& item : this->totalAssignGrps) {
				csvList.push_back(&item);
			}
			reader.write(outfile, name, csvList, csvParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "Assignment";
		{
			string name = "Assignment";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector<void*> csvList;
			for (auto& item : this->totalAssignmentIdMap) {
				csvList.push_back(item.second.get());
			}
			reader.write(outfile, name, csvList, csvParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "AssignmentGroupMap";
		{
			string name = "AssignmentGroupMap";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			map<string, ASSIGNMENT_GROUP*> groupMap;
			for (auto& item : this->totalAssignGrps) {
				if (item.airline == this->scenario.airline) {
					groupMap[item.assignGrp] = &item;
				}
			}
			vector<void*> csvList;
			//for (auto& item : this->assignmentNameGroupMap) {
			//	string name = item.first;
			//	string grp = item.second;
			//	ASSIGNMENT * assign = this->assignmentNameMap[name].get();
			//	ASSIGNMENT_GROUP * group = groupMap[grp];
			//	ASSIGNMENT_GROUP_MAP * copy = new ASSIGNMENT_GROUP_MAP;
			//	copy->assignGrpId = group->assignGrpId;
			//	copy->assignId = assign->ASSIGNMENT_ID;
			//	csvList.push_back(copy);
			//}
			for (auto& grp : this->assignmentNameGroupMap) {
				for (auto& assignName : grp.second) {
					ASSIGNMENT * assign = this->assignmentNameMap[assignName].get();
					ASSIGNMENT_GROUP * group = groupMap[grp.first];
					ASSIGNMENT_GROUP_MAP * copy = new ASSIGNMENT_GROUP_MAP;
					copy->assignGrpId = group->assignGrpId;
					copy->assignId = assign->ASSIGNMENT_ID;
					csvList.push_back(copy);
				}
			}
			reader.write(outfile, name, csvList, csvParser);
			CLEANUP_CSV_LIST(csvList);
		}
		dbg = "Fleet";
		{
			string name = "Fleet";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector<void*> csvList;
			for (auto& item : this->fleetList) {
				csvList.push_back(&item);
			}
			reader.write(outfile, name, csvList, csvParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "Base";
		{
			string name = "Base";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector<void*> csvList;
			for (auto& item : this->baseList) {
				csvList.push_back(&item);
			}
			reader.write(outfile, name, csvList, csvParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "Rank";
		{
			string name = "Rank";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector<void*> csvList;
			for (auto& item : this->rankList) {
				csvList.push_back(&item);
			}
			reader.write(outfile, name, csvList, csvParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "RankActing";
		{
			string name = "RankActing";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector<void*> csvList;
			for (auto& item : this->rankActingList) {
				csvList.push_back(&item);
			}
			reader.write(outfile, name, csvList, csvParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "Holiday";
		{
			string name = "Holiday";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector<void*> csvList;
			for (auto& item : this->holidays) {
				csvList.push_back(item.get());
			}
			reader.write(outfile, name, csvList, csvParser);
			//csvList: original obj, cleanup is unnecessary 
		}
		dbg = "Rule";
		{
			string name = "Rule";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			map<long long, DBRule*> includedRuleMap;
			vector<void*> csvList;
			for (auto& item : this->ruleList) {
				if (includedRuleMap.find(item.idRule) == includedRuleMap.end()) {
					includedRuleMap[item.idRule] = &item;
					DBRule * copy = new DBRule();
					copy->copyFrom(&item);
					csvList.push_back(copy);
				}
			}
			reader.write(outfile, name, csvList, csvParser);
			CLEANUP_CSV_LIST(csvList);
		}
		dbg = "RuleParameter";
		{
			string name = "RuleParameter";
			saveCsvRuleParameter(reader, outfile, name, this->ruleList);
		}
		dbg = "Cqf";
		{
			string name = "Cqf";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			map<long long, DBRule*> includedRuleMap;
			vector<void*> csvList;
			for (auto& item : this->cqfList2) {
				if (includedRuleMap.find(item.idRule) == includedRuleMap.end()) {
					includedRuleMap[item.idRule] = &item;
					DBRule * copy = new DBRule();
					copy->copyFrom(&item);
					csvList.push_back(copy);
				}
			}
			reader.write(outfile, name, csvList, csvParser);
			CLEANUP_CSV_LIST(csvList);
		}
		dbg = "CqfParameter";
		{
			string name = "CqfParameter";
			saveCsvRuleParameter(reader, outfile, name, this->cqfList2);
		}
		dbg = "SystemParameter";
		{
			string name = "SystemParameter";
			shared_ptr<csvParser> csvParser = reader.getParser(name);
			vector<void*> csvList;
			for (auto& item : this->systemParamMap) {
				csvSystemParam * copy = new csvSystemParam;
				copy->parmName = item.first;
				copy->parmValue = item.second;
				csvList.push_back(copy);
			}
			reader.write(outfile, name, csvList, csvParser);
			CLEANUP_CSV_LIST(csvList);
		}
	}
	catch (exception& ex) {
		Logger::getRuleLogger()->error("ERROR: saveScenarioCsv failed {}, dbg={} i={}", ex.what(), dbg, i);
	}
	if (errLog.is_open())
		errLog.close();
	if (outfile.is_open())
		outfile.close();
	return errorCode;
}

int CrewDataContext::saveMandayCsv(const char * filepath, time_t startDtLoc, time_t endDtLoc, const unordered_map<long long, std::shared_ptr<ROSTER>>& orgRosterMap) {

	int errorCode = 0;
	int i = 0, j = 0;
	string dbg = "";
	time_t startDtUtc = 0, endDtUtc = 0;
	ofstream outfile(filepath, std::ios_base::binary | std::ios_base::out);
	Logger::getRuleLogger()->info("saveMandayCsv {} {} {} ", utcToUtcString(startDtLoc).c_str(), utcToUtcString(endDtLoc).c_str(), filepath);
	try{
		//read csv
		dbg = "reader.";
		crewCsvReader reader;

		dbg = "scenario"; //for scenarioId/startDt/endDt
		{
			Scenario scenario = { 0 };
			/*scenario.scenarioId = this->scenario.scenarioId;
			scenario.startDtUTC = localToUtc(startDtLoc);
			scenario.endDtUTC = localToUtc(endDtLoc);*/
			scenario = this->scenario;
			shared_ptr<csvParser> scenarioParser = reader.getParser("Scenario");
			vector<void*> dataScenarioList;
			dataScenarioList.push_back(&scenario);
			reader.write(outfile, "Scenario", dataScenarioList, scenarioParser);
		}
		dbg = "CrewManday";
		saveMandayToCsvStream(outfile, startDtLoc, endDtLoc, reader, this);

		dbg = "Roster";//输出地面任务credit和workHour
		saveGroundRosterToCsvStream(outfile, startDtLoc, endDtLoc, orgRosterMap, this);

		
		dbg = "CrewId";
		{
			shared_ptr<csvParser> stringParser = reader.getParser("CrewId");
			vector<void*> dataList;
			for (auto& crew : this->crewList) {
				dataList.push_back(&(crew->idCrew));
			}
			reader.write(outfile, "CrewId", dataList, stringParser);
		}

	}
	CATCH_EXCEPTIONS("saveMandayCsv");

	if (outfile.is_open())
		outfile.close();
	return errorCode;
}

//20190914 ain, OP#2279, 重算历史号位
int CrewDataContext::saveRosterFlightCsv(const char * filepath, time_t startDtLoc, time_t endDtLoc) {

	int errorCode = 0;
	int i = 0, j = 0;
	string dbg = "";
	time_t startDtUtc = 0, endDtUtc = 0;
	ofstream outfile(filepath, std::ios_base::binary | std::ios_base::out);
	Logger::getRuleLogger()->info("saveRosterFlightCsv {} {} {} ", utcToUtcString(startDtLoc).c_str(), utcToUtcString(endDtLoc).c_str(), filepath);
	try{
		//read csv
		dbg = "reader.";
		crewCsvReader reader;

		dbg = "scenario"; //for scenarioId/startDt/endDt
		{
			Scenario scenario = { 0 };
			scenario.scenarioId = this->scenario.scenarioId;
			scenario.startDtUTC = localToUtc(startDtLoc);
			scenario.endDtUTC = localToUtc(endDtLoc);
			shared_ptr<csvParser> scenarioParser = reader.getParser("Scenario");
			vector<void*> dataScenarioList;
			dataScenarioList.push_back(&scenario);
			reader.write(outfile, "Scenario", dataScenarioList, scenarioParser);
		}
		dbg = "RosterFlight";
		vector<long long> flightIds;
		saveRosterFlightToCsvStream(outfile, startDtLoc, endDtLoc, flightIds, reader, this);

	}
	CATCH_EXCEPTIONS("saveRosterFlightCsv");

	if (outfile.is_open())
		outfile.close();
	return errorCode;
}

int CrewDataContext::saveRecencyCsv(const char * filepath) {

	int errorCode = 0;
	int i = 0, j = 0;
	string dbg = "";
	time_t startDtUtc = 0, endDtUtc = 0;
	ofstream outfile(filepath, std::ios_base::binary | std::ios_base::out);
	Logger::getRuleLogger()->info("saveRecencyCsv {} ", filepath);
	try{
		//read csv
		dbg = "reader.";
		crewCsvReader reader;

		dbg = "scenario"; //for scenarioId/startDt/endDt
		{
			Scenario scenario = { 0 };
			scenario.scenarioId = this->scenario.scenarioId;
			scenario.startDtUTC = this->scenario.startDtUTC;
			scenario.endDtUTC = this->scenario.endDtUTC;
			shared_ptr<csvParser> scenarioParser = reader.getParser("Scenario");
			vector<void*> dataScenarioList;
			dataScenarioList.push_back(&scenario);
			reader.write(outfile, "Scenario", dataScenarioList, scenarioParser);
		}
		dbg = "CrewRecency";
		{
			//20180730 ain, mantis#3708, ruleTool saveRecency, 按scenario时间段筛选, 按crew/dep/arv/fleet/rank/role保存最新记录
			shared_ptr<csvParser> recencyParser = reader.getParser("CrewRecency");
			map<string, shared_ptr<CrewRecency>> filterMap;
			map<string, int> keyCount;
			stringstream ss;
			vector<void*> dataList;
			for (auto& recencyOfCrew : this->recencyMgr.getRecencyMap()) {
				for (auto& it : recencyOfCrew.second) {
					for (auto& item : it.second) {
						if (item->crewDateUtc >= this->scenario.startDtUTC && item->crewDateUtc < this->scenario.endDtUTC + 24 * 3600 - 1) {
							ss.str("");
							ss << item->idcrew << "::" << item->depAirport << "::" << item->arvAirport << "::" << item->fleet << "::" << item->actingRank << "::" << item->role;
							string key = ss.str();
							if (keyCount.find(key) == keyCount.end())
								keyCount[key] = 1;
							else
								keyCount[key] = keyCount[key] + 1;
							if (filterMap.find(key) == filterMap.end()) {
								filterMap[key] = item;
							}
							else {
								if (filterMap[key]->crewDateUtc < item->crewDateUtc)
									filterMap[key] = item;
							}	
						}
						else {
						}
					}
				}
			}
			for (auto& it : filterMap) {
				dataList.push_back(it.second.get());
			}
			reader.write(outfile, "CrewRecency", dataList, recencyParser);
			map<long long, Pairing*> pairingMap;
			for (auto& p : pairingList) {
				pairingMap[p->getDbId()] = p;
			}
		}
	}
	catch (exception& ex) {
		Logger::getRuleLogger()->error("ERROR: saveMandayCsv failed {}, dbg={} i={}", ex.what(), dbg, i);
	}
	if (outfile.is_open())
		outfile.close();
	return errorCode;
}

int CrewDataContext::saveFlightChange(const char* filepath, vector<long long>& flightIds) {
	int ret = 0;
	int i = 0;
	string dbg = "";
	crewCsvReader reader;
	string defaultAirport = this->systemParamMap["CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE"];
	int timezoneOffsetMinutes = this->getAirportOffsetMinutes(defaultAirport);
	time_t startDtLoc = this->scenario.startDtUTC + timezoneOffsetMinutes * 60;
	time_t endDtLoc = this->scenario.endDtUTC + timezoneOffsetMinutes * 60;
	ofstream outfile(filepath, std::ios_base::binary | std::ios_base::out);
	Logger::getRuleLogger()->info("saveMandayCsv {} {} {} ", utcToUtcString(startDtLoc).c_str(), utcToUtcString(endDtLoc).c_str(), filepath);

	// 根据传入的flightIds找到对应的pairingIds
	set<long long> pairingIds;
	for (auto& pairing : this->pairingList) {
		for (auto& duty : pairing->getDutyVec()) {
			for (auto& seg : duty->getSegments()) {
				if (std::find(flightIds.begin(), flightIds.end(), seg->getDBId()) != flightIds.end()) {
					pairingIds.insert(pairing->getDbId());
					break;
				}
			}
			if (!pairingIds.empty() && pairingIds.count(pairing->getDbId()) > 0) {
				break;
			}
		}
	}

	// 根据pairingIds找到所有相关的fltId
	vector<long long> allFlightIds;
	for (auto& pairing : this->pairingList) {
		if (pairingIds.count(pairing->getDbId()) > 0) {
			for (auto& duty : pairing->getDutyVec()) {
				for (auto& seg : duty->getSegments()) {
					allFlightIds.push_back(seg->getDBId());
				}
			}
		}
	}

	try {
		dbg = "Scenario";
		shared_ptr<csvParser> scenarioParser = reader.getParser("Scenario");
		vector<void*> dataScenarioList;
		dataScenarioList.push_back(&this->scenario);
		reader.write(outfile, "Scenario", dataScenarioList, scenarioParser);

		dbg = "Pairing";
		savePairingDutySegmentToCsv(outfile, this->pairingList, reader, this);

		dbg = "Roster";
		saveRosterToCsv(outfile, reader, this, false);//false:not saveNewRoster

		dbg = "RosterFlight";
		saveRosterFlightToCsvStream(outfile, startDtLoc, endDtLoc, allFlightIds, reader, this);

		dbg = "CrewManday";
		saveMandayToCsvStream(outfile, startDtLoc, endDtLoc, reader, this);

		//20191105 ain, mantis#6946, ruleTool change_flight流程失败重试
		outfile << "\n";
		outfile << "------FlightId(-1):value\n";
		for (auto& fid : flightIds) {
			outfile << fid << "\n";
		}
	}
	CATCH_EXCEPTIONS("saveReCalculatePairingRosterManday");

	return ret;
}

int CrewDataContext::saveRefreshDP(const char* filepath) {
	int ret = 0;
	int i = 0;
	string dbg = "";
	crewCsvReader reader;
	string defaultAirport = this->systemParamMap["CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE"];
	int timezoneOffsetMinutes = this->getAirportOffsetMinutes(defaultAirport);
	time_t startDtLoc = this->scenario.startDtUTC + timezoneOffsetMinutes * 60;
	time_t endDtLoc = this->scenario.endDtUTC + timezoneOffsetMinutes * 60;
	ofstream outfile(filepath, std::ios_base::binary | std::ios_base::out);
	Logger::getRuleLogger()->info("saveMandayCsv {} {} {} ", utcToUtcString(startDtLoc).c_str(), utcToUtcString(endDtLoc).c_str(), filepath);
	try {
		dbg = "Scenario";
		shared_ptr<csvParser> scenarioParser = reader.getParser("Scenario");
		vector<void*> dataScenarioList;
		dataScenarioList.push_back(&this->scenario);
		reader.write(outfile, "Scenario", dataScenarioList, scenarioParser);

		dbg = "Pairing";
		savePairingDutySegmentToCsv(outfile, this->pairingList, reader, this);

		dbg = "Roster";
		saveRosterToCsv(outfile, reader, this, false);//false:not saveNewRoster 

		dbg = "CrewManday";
		saveMandayToCsvStream(outfile, startDtLoc, endDtLoc, reader, this);

	}
	CATCH_EXCEPTIONS("saveReCalculateRosterDP");

	return ret;
}

int CrewDataContext::savePairingTagChange(const char* filepath) {
	int ret = 0;
	int i = 0;
	string dbg = "";
	crewCsvReader reader;
	ofstream outfile(filepath, std::ios_base::binary | std::ios_base::out);
	Logger::getRuleLogger()->info("savePairngTag {} ",  filepath);
	try {
		
		dbg = "Pairing";
		savePairingDutySegmentToCsv(outfile, this->pairingList, reader, this);

		dbg = "RosterGround";
		saveRosterGroundTagToCsv(outfile, reader, this);

	}
	CATCH_EXCEPTIONS("saveReCalculatePairingTag");

	return ret;
}

void CrewDataContext::makeCrewGuaranteeFlyHours() {
	//创建GuaranteeFlyHours的索引 key=base+rank+fleet+team
	multimap<string, SharedPtr<GuaranteeFlyHours>> guaranteeFlyHoursMap;
	for (auto& guaranteeFlyHours : guaranteeFlyHoursList) {
		for (auto& base : guaranteeFlyHours->bases) {
			string prefixKey = base + "$";
			for (auto& rank : guaranteeFlyHours->ranks) {
				string prefixKey2 = prefixKey + rank + "$";
				for (auto& fleet : guaranteeFlyHours->fleets) {
					string prefixKey3 = prefixKey2 + fleet + "$";

					if (guaranteeFlyHours->teams.empty()) {
						string key = prefixKey3 + "*";
						guaranteeFlyHoursMap.insert(pair<string, SharedPtr<GuaranteeFlyHours>>(key, guaranteeFlyHours));
					}
					else {
						for (auto& team : guaranteeFlyHours->teams) {
							string key = prefixKey3 + std::to_string(team);
							guaranteeFlyHoursMap.insert(pair<string, SharedPtr<GuaranteeFlyHours>>(key, guaranteeFlyHours));
						}

					}
				}
			}
		}
	}
	//遍历crewList
	for (auto& crew : crewList) {
		string prefixKey = crew->getPrimeBase() + "$";
		for (auto& rank : crew->rankList) {
			string prefixKey2 = prefixKey + rank->rank + "$" + rank->acType + "$";
			for (auto& team : crew->teamList) {
				string key = prefixKey2 + std::to_string(team->team_id);
				auto pos = guaranteeFlyHoursMap.equal_range(key);
				while (pos.first != pos.second)
				{
					crew->guaranteeFlyHoursList.push_back(pos.first->second);
					++pos.first;
				}
			}

			//匹配guaranteeFlyHours中team是*（any）场景
			string key = prefixKey2 + "*";
			auto pos = guaranteeFlyHoursMap.equal_range(key);
			while (pos.first != pos.second)
			{
				crew->guaranteeFlyHoursList.push_back(pos.first->second);
				++pos.first;
			}
		}
	}

}

int CrewDataContext::saveToCsv(const char *filepath, std::vector<Pairing*> &pairings) {
	int errorCode = 0;
	int i = 0, j = 0;
	string dbg = "";
	ofstream outfile(filepath, std::ios_base::binary | std::ios_base::out);
	ofstream errLog;
	try {
		Logger::getRuleLogger()->info("saveToCsv start");
		errLog.open("err.log");

		//read csv
		dbg = "reader.";
		crewCsvReader reader;

		// RO outputs
		//roster
		//make copy for each roster of result (0 or current scenario)
		dbg = "Roster";
		saveRosterToCsv(outfile, reader, this);
		//20201110 mantis#8798 问题一 out_put 增加RosterFlight输出
		dbg = "RosterFlight";
		vector<long long> flightIds;
		saveRosterFlightToCsvStream(outfile, this->startUtc, this->endUtc, flightIds, reader, this);
		//20181223 ain, mantis#4694, saveRo保存manday参数为scenario.start/end loc
		//CrewMandayCcAm
		dbg = "CrewManday";
		string defaultAirport = this->systemParamMap["CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE"];
		int timezoneOffsetMinutes = this->getAirportOffsetMinutes(defaultAirport);
		saveMandayToCsvStream(outfile, this->startUtc + (time_t)(timezoneOffsetMinutes * 60), this->endUtc + (time_t)(timezoneOffsetMinutes * 60), reader, this);

		//ak crewmemo
		dbg = "crewmemo";

		int count = 0;
		for (auto& obj : this->crewIdToPhaseToPeriodsForAK)
		{
			map<string, pair<string, string>> phaseToPeriods = obj.second;
			for (auto& obj2 : phaseToPeriods)
			{
				count++;
			}
		}
		if (crewIdToPhaseToPeriodsForAK.size() == 0)
		{
			count = 1;
		}
		outfile << "------CrewMemo" << "(" << count << "):" << "crewId" <<","<<"id"<<","<<"strDtLoc" <<"," << "endDtLoc" << "," << "memo" << "," << "userId"
				<<","<<"tmst"<<","<<"status"<<","<<"rosterId"<< endl;
		for (auto& obj : this->crewIdToPhaseToPeriodsForAK)
		{
			string crewId = obj.first;
			map<string, pair<string, string>> phaseToPeriods = obj.second;
			for (auto& obj2 : phaseToPeriods)
			{
				string phase = obj2.first;
				string startTime = obj2.second.first;
				string endTime = obj2.second.second;
				//outfile << crewId << "^" << startTime << "^" << endTime << "^" << phase << endl;
				outfile << crewId << "^" << "" << "^" << startTime << "^" << endTime << "^" << "FINAL CHECK" << "^" << "" << "^" << "" << "^" << "" << "^" << "" << endl;
			}
		}

		// TO outputs
		dbg = "Scenario";
		shared_ptr<csvParser> scenarioParser = reader.getParser("Scenario");
		vector<void*> dataScenarioList;
		dataScenarioList.push_back(&this->scenario);
		reader.write(outfile, "Scenario", dataScenarioList, scenarioParser);

		dbg = "PairingChangeRecord";
		shared_ptr<csvParser> pairingChangeRecordParser = reader.getParser("PairingChangeRecord");
		vector<void*> pairingChangeRecordList;
		auto pairingChangeRecords = this->dbTrainingDataHolder->GetDBTrainingPairingChangeRecords();
		pairingChangeRecordList.reserve(pairingChangeRecords.size());
		for(auto &pairingChangeRecord : pairingChangeRecords){
			pairingChangeRecordList.push_back(pairingChangeRecord);
		}
		reader.write(outfile, "PairingChangeRecord", pairingChangeRecordList, pairingChangeRecordParser);

		dbg = "ProgramCourseParticipant";
		shared_ptr<csvParser> programCourseParticipantParser = reader.getParser("ProgramCourseParticipant");
		vector<void*> programCourseParticipantList;
		auto programCourseParticipants = this->dbTrainingDataHolder->GetDBTrainingProgramCourseParticipants();
		programCourseParticipantList.reserve(programCourseParticipants.size());
		for(auto &programCourseParticipant : programCourseParticipants){
			programCourseParticipantList.push_back(programCourseParticipant);
		}
		reader.write(outfile, "ProgramCourseParticipant", programCourseParticipantList, programCourseParticipantParser);

		dbg = "ProgramCourseInstructorParticipant";
		shared_ptr<csvParser> programCourseInstructorParticipantParser = reader.getParser("ProgramCourseInstructorParticipant");
		vector<void*> programCourseInstructorParticipantList;
		auto programCourseInstructorParticipants = this->dbTrainingDataHolder->GetDBTrainingProgramCourseInstructorParticipants();
		programCourseInstructorParticipantList.reserve(programCourseInstructorParticipants.size());
		for(auto &programCourseInstructorParticipant : programCourseInstructorParticipants){
			programCourseInstructorParticipantList.push_back(programCourseInstructorParticipant);
		}
		reader.write(outfile, "ProgramCourseInstructorParticipant", programCourseInstructorParticipantList, programCourseInstructorParticipantParser);

		dbg = "TmDeviceTime";
		shared_ptr<csvParser> tmDeviceTimeParser = reader.getParser("TmDeviceTime");
		vector<void*> tmDeviceTimePtrList;
		tmDeviceTimePtrList.reserve(this->tmDeviceTimeList.size());
		for(auto &tmDeviceTimeIt : this->tmDeviceTimeList){
			tmDeviceTimePtrList.push_back(tmDeviceTimeIt.get());
		}
		reader.write(outfile, "TmDeviceTime", tmDeviceTimePtrList, tmDeviceTimeParser);

		dbg = "TmProgramCourse";
		shared_ptr<csvParser> tmProgramCourseParser = reader.getParser("TmProgramCourse");
		vector<void*> tmProgramCoursePtrList;
		tmProgramCoursePtrList.reserve(this->tmProgramCourseMap.size());
		std::map<long long, std::shared_ptr<TmProgramCourse>> tmProgramCourseMapTemp(this->tmProgramCourseMap.begin(),
																					 this->tmProgramCourseMap.end());
		for(auto &tmProgramCourseIt : tmProgramCourseMapTemp){
			// TmProgramCourse表中id为正的记录均为输入内容 - ROSCRW-16043
			// ROSCRW-17468 为展示TrainingAssignment信息，需要输出PA的program course
			//if(tmProgramCourseIt.second->id > 0) continue;
			tmProgramCoursePtrList.push_back(tmProgramCourseIt.second.get());
		}
		reader.write(outfile, "TmProgramCourse", tmProgramCoursePtrList, tmProgramCourseParser);

		dbg = "TmProgramCourseInstructor";
		shared_ptr<csvParser> tmProgramCourseInstructorParser = reader.getParser("TmProgramCourseInstructor");
		vector<void*> tmProgramCourseInstructorPtrList;
		tmProgramCourseInstructorPtrList.reserve(this->tmProgramCourseInstructorMap.size());
		std::map<long long, std::shared_ptr<TmProgramCourseInstructor>> tmProgramCourseInstructorMapTemp(this->tmProgramCourseInstructorMap.begin(),
																										 this->tmProgramCourseInstructorMap.end());
		for(auto &tmProgramCourseInstructorIt : tmProgramCourseInstructorMapTemp){
			tmProgramCourseInstructorPtrList.push_back(tmProgramCourseInstructorIt.second.get());
		}
		reader.write(outfile, "TmProgramCourseInstructor", tmProgramCourseInstructorPtrList, tmProgramCourseInstructorParser);

		// PO outputs
		bool success = false;
		//PairingDBContext* ctx = PairingDBContext::getDbConnection();
		cout << utcToUtcString(time(0) + 8 * 3600) << " saveDataPO size=" << pairings.size() << endl;
		//20180416 ain, mantis#3143, 补齐pairing.region
		for (Pairing* p : pairings) {
			if (p->getRegion().empty())
				p->setRegion("_");
		}
		//20180508 ain, mantis#3302, 按duty中是否包含FLY赋值 duty.type, 含飞行航段时type=O; 仅有DHD/BUS航段时type=P
		//修正 segment.assignment = FLY/DHD
		for (Pairing* p : pairings) {
			for (std::size_t i = 0; i < p->getNumDuties(); i++) {
				Duty* d = p->getDuty(i);
				bool foundFlySegment = false;
				bool containFlight = false;
				for (std::size_t j = 0; j < d->getNumSegments(); j++) {
					Segment* s = d->getSegment(j);
					if (s->getDBId() > 0) {
						containFlight = true;
					}
					if (s->getIsOperating() && s->getDBId() > 0) {
						foundFlySegment = true;
					}
					else if (s->getIsDeadhead() && s->getDBId() > 0) {
						s->setAssignment("DHD");
					}
				}
				if (containFlight) {
					d->setType(foundFlySegment ? Duty::DUTY_TYPE::DUTY_PURE_OPR : Duty::DUTY_TYPE::DUTY_POS_OWN);
				}
			}
		}
		//20181103 ain, mantis#4388, pairing.endArp
		for (Pairing* p : pairings) {
			int size = (int)p->getNumDuties();
			p->setEndArp((size > 0) ? p->getDuty(size - 1)->getArrStation() : "");
		}
		//20181115 ain, OP#1950, savePO按seg.fleet汇总 pairing.fleetGrp
		setPairingFleetGrpBySegmentForTo(pairings);

		// no need to remove leadins in DB, PO will manage pairings for output
		//20200415 ain, mantis#7997, savePO结果移除 leadin pairing
		// vector<Pairing*> pgOfScen = filterPairingByScenario(list, this->scenarioId);

		//预处理：临时 pairingId/dutyId, 复制pairing/duty/segment副本
		//20180704 ain, mantis#3580, savePoCsv逻辑复制 pairing/duty/seg副本, 避免duty/seg被多pairing重复覆盖问题
		//20181011 ain, mantis#4212, 先执行 duty/seg copy, 再计算 region/fdp/assignment等，
//		dbg = "pre-save id";
//		cout << "savePoCsv makePairingDutySegmentCopy" << endl;
//		vector<Pairing*> pairingCopies = makePairingDutySegmentCopy(pairings, scenario, true);

		dbg = "pre-save airport";
		cout << "savePoCsv resetPairingDutyAirport" << endl;
		resetPairingDutyAirport(pairings);

		dbg = "pre-save pairing.region";
		cout << "savePoCsv resetPairingRegion" << endl;
		resetPairingRegion(pairings);

		dbg = "pre-save bus/rail segment assignment";
		cout << "savePoCsv resetPairingSegmentAssignment" << endl;
		resetPairingSegmentAssignment(pairings);

		dbg = "reset FDP";
		for (Pairing* p : pairings) {
			calculatePairingDutyTimes(p, this);
		}

		//20180428 ain, mantis#3228, 预处理 duty.actFt/actFdp/actDp/historyBlk
		dbg = "pre-save fdp/dp/blk";
		cout << "savePoCsv resetPairingDutyFdpDpBlk" << endl;
		resetPairingDutyFdpDpBlk(pairings);

		//20190223 ain, OP#2003, pairing.attribute
		cout << "savePoCsv pairing.attr" << endl;
		PairingAttributeCalculator pairingAttrCalculator(scenario.airline, flightList, routeList, attributeIdMap, airportCodeMap, assignmentNameGroupMap, rankMap, tagCategoryList, tagFlightGroupMap,
														 tagDutyGroupMap, tagPairingGroupMap, tagGroupTableMap, tagGroupMap, tagFlightCompositionGroupMap);
		if (this->version == 2 || scenario.airline == "JG") {
			pairingAttrCalculator.calculateAndSetPairingAttr(pairings);
		} else {
			pairingAttrCalculator.calculateAndSetPairingTag(pairings);
		}

		for (Pairing* p : pairings) {
			p->setDivision(this->scenario.division);
		}
		//20190303 ain, mantis#5045, savePO 按 pickup修正pairing.start
		cout << "savePoCsv pairing.start=duty-pickup" << endl;
		resetPairingStartByPickupForTo(pairings);

		dbg = "savePoCsv resetPairingDutyNodes";
		cout << "savePoCsv resetPairingDutyNodes" << endl;
		//20191120 ain, mantis#7105, savePO补齐 dutyNode (brief/debrief/pick/drop)
		resetPairingDutyNodes(pairings, this);

		//20200904 ain, mantis#8731, savePO, duty.layoverNits
		calculateDutyLayoverNights(pairings, this);

		//20190508 ain, mantis#5518, 重构代码, 只有savePO需要法规重算配比 rankValue
		//20230427 PD GJ-115, 跳过重算配比，使用PO内部计算结果,此处根据PO结果填充segment criteria ID
		cout << "savePoCsv pairing.composition" << endl;
		PairingCompositionCalculator calculator(this);
		calculator.setDbContext(this);
		try {
			calculator.setEnableDebugLog(false);
			for (auto pg : pairings) {
				calculator.updateRankCombinationCriteriaID(pg);
			}
		}
		catch (...) {}
		//20190615 ain, savePoCsv流程, 全部按 pairingCopies代替 this->pairingList
		//20190527 ZZM, rankComb after composition
		//20180926 ain, mantis#4127, savePO, label
		//20180929 ain, OP#1901, pairing.rankCombCriteriaID
		cout << "savePoCsv pairing.label" << endl;
		for (Pairing * p : pairings) {
			p->setLabel(makePairingLabel(p, this));
		}
		//20230427 PD GJ-115, 跳过重算配比，使用PO内部结果
		//cout << "savePoCsv pairing.rank-combination" << endl;
		//calculatePairingListRankCombination(pairingCopies, this);
		//cleanupList(csvSegList);
		//cleanup
//		for (auto& p : pairingCopies) {
//			for (auto& d : p->getDutyVec()) {
//				for (auto& s : d->getSegments())
//					delete s;
//				delete d;
//			}
//			delete p;
//		}
//		pairingCopies.clear();
//
//		dbg = "cleanup pairingCopies";
//		clearPairingDutySegmentCopy(pairingCopies);

		Logger::getRuleLogger()->info("savePoCsv start");
		errLog.open("err.log");
		resetPairingDutySegmentId(pairings, scenario);
		test_file_pairing(pairings, "po_output_pairing.txt");

		//cleanupList(dataScenarioList);
		//pairing

		// auto outputPairing = pairingCopies;
		// no need to copy leadin pairings again.
		// std::copy(begin(this->pairingListBeforeRun), end(this->pairingListBeforeRun), back_inserter(outputPairing));
		dbg = "Pairing/Duty/Segment";
		savePairingDutySegmentToCsvForTO(outfile, pairings, reader, this);

		dbg = "Flight";
		shared_ptr<csvParser> flightParser = reader.getParser("Flight");
		vector<void*> csvFlightList;
		for (auto& flight : this->flightList) {
			if (flight->getDBId() < 0)
				csvFlightList.push_back(flight.get());
		}
		reader.write(outfile, "Flight", csvFlightList, flightParser);

	}
	catch (exception& ex) {
		cout << "ERROR: saveToCsv failed " << ex.what() << ", dbg=" << dbg << " i=" << i << endl;
	}
	if (errLog.is_open())
		errLog.close();
	if (outfile.is_open())
		outfile.close();
	return errorCode;
}

void CrewDataContext::setPairingFleetGrpBySegmentForTo(std::vector<Pairing *> &list) {
	string fleetOfMaxDisplayOrder;
	map<string, int> fleetPriorityMap;
	for (auto& fleet : this->fleetList) {
		fleetPriorityMap[fleet.fleet] = fleet.displayOrder;
		if (fleetOfMaxDisplayOrder.empty() || fleetPriorityMap[fleetOfMaxDisplayOrder] < fleet.displayOrder)
			fleetOfMaxDisplayOrder = fleet.fleet;
	}

	for (Pairing* p : list) {
		int minFleetDisplayOrder = 999;
		string pairingFleet = fleetOfMaxDisplayOrder;//init to max
		for (std::size_t i = 0; i < p->getNumDuties(); i++) {
			Duty* d = p->getDuty(i);
			for (std::size_t j = 0; j < d->getNumSegments(); j++) {
				Segment* s = d->getSegment(j);
				string fleet = s->getFleetCD();
				if (fleetPriorityMap[fleet] < fleetPriorityMap[pairingFleet])
					pairingFleet = fleet;
			}
		}
		p->setFltCode(pairingFleet);
	}
}

void CrewDataContext::resetPairingStartByPickupForTo(vector<Pairing *> &list) {
	for (Pairing* p : list) {
		if (p->getNumDuties() > 0) {
			Duty* first = p->getDuty(0);
			Duty* last = p->getDuty(p->getNumDuties() - 1);

			int pickupSecs = 60 * first->getMinPickup();
			int dropoffSecs = 60 * last->getMinDropoff();

			p->setStartTimeUtcSch(first->getStartTimeUtcSch() - pickupSecs);
			p->setStartTimeLocSch(first->getStartTimeLocSch() - pickupSecs);
			p->setEndTimeUtcSch(last->getEndTimeUtcSch() + dropoffSecs);
			p->setEndTimeLocSch(last->getEndTimeLocSch() + dropoffSecs);

			p->syncActTimeBySchTime();
		}
	}
}

void CrewDataContext::addGroundRoster(ErrorContext *errCtx, std::shared_ptr<CREW> &crew, shared_ptr<ROSTER> &roster) {
	roster->rosterId = tempIdGenerator--;
	//按时间顺序找到对应位置并插入
	vector<SharedPtr<ROSTER>>::iterator insertPos;
	for (insertPos = crew->rosterList.begin(); insertPos != crew->rosterList.end(); insertPos++) {
		if (insertPos->get()->strUtc > roster->strUtc)
			break;
		else if (insertPos->get()->strUtc == roster->strUtc && insertPos->get()->restStrUtc > roster->restStrUtc) // mantis#5655
			break;
	}
	crew->rosterList.insert(insertPos, roster);
	crew->makeRosterValidity(roster);
	//刷新index
	refreshRosterIndexOfCrew(crew);

	//manday
	if (mandayForRosterCalculator != NULL) {
		mandayForRosterCalculator->reCalculateSingleRosterManday(crew, roster, true); //true for addRoster, false for delRoster
	}

	//新增roster添加到this.rosterList列表中
	this->rosterList.emplace_back(roster);//添加roster到rosterList列表中
}

std::shared_ptr<ROSTER> CrewDataContext::delGroundRoster(ErrorContext *errCtx, shared_ptr<CREW> &crew, SharedPtr<ROSTER>& roster) {
	int ret = 0;
	string dbg;
	vector<SharedPtr<ROSTER>>& rosterList = crew->rosterList;
	int index = -1;
	//尝试在paramValue指定crew.rosterList中寻找
	for (std::size_t i = 0; i < crew->rosterList.size(); i++) {
		if (roster->rosterId == crew->rosterList[i]->rosterId) {
			index = (int)i;
			break;
		}
	}
	if (index == -1) {
		//20190222 ain, mantis#4989, delRoster目标不存在时返回不报错
		Logger::getRuleLogger()->error("ERROR: delRoster() fail, crew={} roster={} {} not exist", crew->idCrew, roster->rosterId, utcToUtcString(roster->strUtc));
		return NULL;
		//Logger::getRuleLogger()->error("delRoster fail");
	}
	if (index == -1) {
		return NULL;
	}
	//DBG_HELP("delRoster");
	//stringstream ss;
	//if (crew->idCrew == "BRE16746") {
	//	ss << "delRoster(crew=" << crew->idCrew << ", crewRoster.size=" << rosterList.size() << ", delIndx=" << index << ")";
	//}
	//cout << ss.str() << endl;
	//DBG_HELP(ss.str());

	try {

		if (index >= (int)rosterList.size() || index < 0) {
			Logger::getRuleLogger()->error("delRoster on crew={} fail invalid parameter index={}", crew->idCrew, index);
			return nullptr;
		}

		//20181009 ain, mantis#4217, delRoster前重置 fdp
		if (mandayForRosterCalculator != NULL) {
			mandayForRosterCalculator->resetRoseter(index, crew);
		}
		roster = rosterList[index];

		roster->indexInRosterListOfCrew = -1;

		dbg = "removeFromRosterList";

		//crew.rosterList
		rosterList.erase(rosterList.begin() + index);

		dbg = "mandayForRosterCalculator";
		//manday
		if (mandayForRosterCalculator != NULL) {
			mandayForRosterCalculator->reCalculateSingleRosterManday(crew, roster, false); //true for addRoster, false for delRoster
		}
		//从this.rosterList中移除roster
		this->rosterList.erase(std::remove_if(this->rosterList.begin(), this->rosterList.end(),
											  [&roster](const auto& destRoster) {
												  return roster->rosterId == destRoster->rosterId;
											  }), this->rosterList.end());

		if (this->getApplicationType() == "OR" && (this->scenario.category == "RO" || this->scenario.category == "TO")) {
			delTrainingRosterTO(roster);
		}

		//recency
		dbg = "recency";
		recencyMgr.removeRecencyByRoster(roster->idcrew, roster->rosterId);

		//CrewKpiAdjust
		dbg = "CrewKpiAdjust";
		removeCrewKpiAdjustByRoster(crew, roster->rosterId, this->rosterFlightMgr);

		//刷新index
		dbg = "refreshRosterIndexOfCrew";
		refreshRosterIndexOfCrew(crew);
	}
	catch (std::exception& ex) {
		Logger::getRuleLogger()->error("Exception: in delRoster(index), index={}, dbg={} ex:{}", index, dbg, ex.what());
	}
	catch (std::string& ex) {
		Logger::getRuleLogger()->error("Exception: in delRoster(index), index={}, dbg={} ex:{}", index, dbg, ex);
	}
	catch (...) {
		Logger::getRuleLogger()->error("Exception: delRoster(index), index={}, general exception.", index);
	}
	return roster;
}


void mergePairingAndDuty(unordered_map<long long, Pairing*>& pairingIdMap, vector<Duty*>& dutyList) {
	for (std::size_t i = 0; i < dutyList.size(); i++) {
		Duty * d = dutyList[i];
		long long pairingId = d->getPairingId();
		if (pairingIdMap.find(pairingId) == pairingIdMap.end()) {
			Logger::getRuleLogger()->error("ERROR: merge duty->pairing fail, pairing={} not found for duty={}", pairingId, d->getDutyId());
		}
		else {
			Pairing * p = pairingIdMap[pairingId];
			p->appendDuty(d);
		}
	}
}

void mergeDutyAndSegment(unordered_map<long long, Duty*>& dutyIdMap, vector<Segment*>& segmentList) {
	for (std::size_t i = 0; i < segmentList.size(); i++) {
		Segment * s = segmentList[i];
		long long dutyId = s->getDutyId();
		if (dutyIdMap.find(dutyId) == dutyIdMap.end()) {
			Logger::getRuleLogger()->error("ERROR: merge segment->duty fail, duty={} not found for segment={}", dutyId, s->getSegmentId());
		}
		else {
			Duty * d = dutyIdMap[dutyId];
			d->appendSegment(s);
		}
	}
}


void filterCrewDataByPeriod(CrewDataContext* dataCtx, map<string, SharedPtr<CREW>>& allcrews) {
#define removeCrewDataByPeriod(start, end, list, effName, expName) \
	for (int i = (int)list.size()-1; i >= 0; i--) {\
		auto& item = list[i];\
		if (item->effName > end || item->expName < start) {\
			list.erase(list.begin() + i);\
		}\
	}
	
	time_t startDtWithLeadin = dataCtx->startUtc - 24 * 3600 * atoi(dataCtx->systemParamMap["DEFAULT_LEADIN_DAYS_PRIOR_ROSTER_PERIOD"].c_str());
	time_t endDtWithLeadout = dataCtx->endUtc + 24 * 3600 * atoi(dataCtx->systemParamMap["DEFAULT_LEADOUT_DAYS_POST_ROSTER_PERIOD"].c_str());

	///TEST
	Logger::getRuleLogger()->info("filterCrewDataByPeriod {} {}", utcToUtcDtString(startDtWithLeadin).c_str(), utcToUtcDtString(endDtWithLeadout).c_str());


	for (auto& it : allcrews) {
		auto& crew = it.second;
		//removeCrewDataByPeriod(startUtc, endUtc, crew->baseList);
		removeCrewDataByPeriod(startDtWithLeadin, endDtWithLeadout, crew->fleetList, effUtc, expUtc);
		//20180824 ain, mantis#
		//removeCrewDataByPeriod(startDtWithLeadin, endDtWithLeadout, crew->rankList, effUtc, expUtc);
		removeCrewDataByPeriod(startDtWithLeadin, endDtWithLeadout, crew->qualificationList, issuedUtc, expiryUtc);
		removeCrewDataByPeriod(startDtWithLeadin, endDtWithLeadout, crew->statusList, effDt, expdt);
		removeCrewDataByPeriod(dataCtx->startUtc, dataCtx->endUtc, crew->teamList, effDt, expDt);
		removeCrewDataByPeriod(startDtWithLeadin, endDtWithLeadout, crew->preferenceList, strDtloc, endDtLoc);
	}
}

void computeFlightSegmentComposition(time_t scenarioStartUtc, unordered_map<long long, SharedPtr<Segment>>& flightIdMap, unordered_map<long long, Segment*>& ferryFlightIdMap, vector<Pairing*>& pairingList) {

	//flight.comp.open reset
	for (auto& it : flightIdMap) {
		it.second->resetOpenComposition();
	}
	//flihgt.comp.plan -> seg.comp.plan
	for (Pairing* p : pairingList) {
		for (std::size_t i = 0; i < p->getNumDuties(); i++) {
			Duty* d = p->getDuty(i);
			for (std::size_t j = 0; j < d->getNumSegments(); j++) {
				Segment* s = d->getSegment(j);
				if (s->getDBId() == 0) {
					continue;
				}
				if (flightIdMap.find(s->getDBId()) == flightIdMap.end()) {
					//20180720 ain, mantis#3672, 计算 flight.fill忽略 PO leadin引入的航班
					if (s->getStartTimeUtcSch() < scenarioStartUtc || ferryFlightIdMap.find(s->getDBId()) != ferryFlightIdMap.end()) {
						continue;
					}
					else {
						Logger::getRuleLogger()->error("ERROR: invalid data no flt found for segment of pairing={} / flt_id={}", p->getDbId(), s->getDBId());
						continue;
					}
				}
				SharedPtr<Segment> flt = flightIdMap[s->getDBId()];
				s->setPlanComposition(flt->getPlanComposition());
				s->resetOpenComposition();
			}
		}
	}
	//flight.comp.fill
	for (Pairing* p : pairingList) {
		for (std::size_t i = 0; i < p->getNumDuties(); i++) {
			Duty* d = p->getDuty(i);
			for (std::size_t j = 0; j < d->getNumSegments(); j++) {
				Segment* s = d->getSegment(j);
				if (s->getDBId() == 0) {
					continue;
				}
				if (flightIdMap.find(s->getDBId()) == flightIdMap.end()) {
					if (s->getStartTimeUtcSch() < scenarioStartUtc || ferryFlightIdMap.find(s->getDBId()) != ferryFlightIdMap.end()) {
						continue;
					}
					else {
						Logger::getRuleLogger()->error("ERROR: invalid data no flt found for segment of pairing={} / flt_id={}", p->getDbId(), s->getDBId());
						continue;
					}
				}
				SharedPtr<Segment> flt = flightIdMap[s->getDBId()];
				for (auto& it : p->getComplements()) {
					string rank = it.first;
					int value = it.second;
					flt->fillCompositionRank(rank, value);
				}
			}
		}
	}
	//flight.comp.fill -> seg.comp.fill
	for (Pairing* p : pairingList) {
		for (std::size_t i = 0; i < p->getNumDuties(); i++) {
			Duty* d = p->getDuty(i);
			for (std::size_t j = 0; j < d->getNumSegments(); j++) {
				Segment* s = d->getSegment(j);
				if (s->getDBId() == 0) {
					continue;
				}
				if (flightIdMap.find(s->getDBId()) == flightIdMap.end()) {
					if (s->getStartTimeUtcSch() < scenarioStartUtc || ferryFlightIdMap.find(s->getDBId()) != ferryFlightIdMap.end()) {
						continue;
					}
					else {
						Logger::getRuleLogger()->error("ERROR: invalid data no flt found for segment of pairing={} / flt_id={}", p->getDbId(), s->getDBId());
						continue;
					}
				}
				auto flt = flightIdMap[s->getDBId()];
				for (auto& it : flt->getFillComposition()) {
					string rank = it.first;
					int value = it.second;
					s->fillCompositionRank(rank, value);
				}
			}
		}
	}
}
//20180724 ain, OP#1834
//make index: flt_id --> pairing_id 
void makeFltToPairingMapIndex(vector<Pairing*>& pairings, unordered_map<long long, vector<long long>>& result) {
	for (auto& p : pairings) {
		for (std::size_t i = 0; i < p->getNumDuties(); i++) {
			Duty* d = p->getDuty(i);
			for (std::size_t j = 0; j < d->getNumSegments(); j++) {
				Segment* s = d->getSegment(j);
				long long fltId = s->getDBId();
				if (result.find(fltId) == result.end()) {
					result.insert(make_pair(fltId, vector<long long>()));
				}
				result[fltId].push_back(p->getDbId());
			}
		}
	}
}

void makePairingLabelMapIndex(Pairing* p, map<string, vector<Pairing*>>& result) {
	if (p == nullptr) return;
	auto label = p->getLabel();
	auto iterPairingLabel = result.find(label);
	if (iterPairingLabel == result.end()) {
		vector<Pairing*> pairingVec;
		pairingVec.emplace_back(p);
		result.insert(make_pair(label, pairingVec));
	}
	else {
		vector<Pairing*>& pairingVec = iterPairingLabel->second;
		pairingVec.emplace_back(p);
	}
}

void makePairingLabelMapIndex(vector<Pairing*>& pairings, map<string, vector<Pairing*>>& result) {
	for (auto& p : pairings) {
		makePairingLabelMapIndex(p, result);
	}
}

void removePairingLabelMapIndex(Pairing* p, map<string, vector<Pairing*>>& result) {
	if (p == nullptr) return;
	auto label = p->getLabel();
	auto pairingId = p->getDbId();
	removePairingLabelMapIndex(label, pairingId, result);
}

void removePairingLabelMapIndex(vector<Pairing*>& pairings, map<string, vector<Pairing*>>& result) {
	for (auto& p : pairings) {
		removePairingLabelMapIndex(p, result);
	}
}

void removePairingLabelMapIndex(const string& pairingLabel, const long long pairingId, map<string, vector<Pairing*>>& result) {
	auto iterPairingLabel = result.find(pairingLabel);
	if (iterPairingLabel == result.end()) {
		return;
	}
	vector<Pairing*>& pairingVec = iterPairingLabel->second;
	pairingVec.erase(std::remove_if(pairingVec.begin(), pairingVec.end(),
		[pairingId](const auto& destPairing) {
			if (destPairing->getDbId() == pairingId) {
				return true;
			}
			return false;
		}), pairingVec.end());
	if (pairingVec.empty()) {
		result.erase(pairingLabel);
	}
}

void resetCrewRankFleetQualLocalTimeToUtc(CrewDataContext* dataCtx) {
	for (auto& it : dataCtx->crewIdMap) {
		string crewId = it.first;
		auto& crew = it.second;
		for (auto& item : crew->rankList) { resetCrewRankByCrewBaseAndTimezone(item, crewId, item->rank, item->effUtc, item->expUtc, dataCtx); }
		for (auto& item : crew->companyRankList) { resetCrewCompanyRankByCrewBaseAndTimezone(item, crewId, item->companyRank, item->effDt, item->expDt, dataCtx); }
		for (auto& item : crew->fleetList) { resetCrewFleetByCrewBaseAndTimezone(item, crewId, item->fleet, item->effUtc, item->expUtc, dataCtx); }
		for (auto& item : crew->qualificationList) { resetCrewQualTimeByCrewBaseAndTimezone(item, crewId, item->issuedUtc, item->renewedUtc, item->cancelUtc, item->expiryUtc, dataCtx, item->earliestUtc, item->latestUtc, item->baseMonthStartUtc); }
		for (auto& item : crew->qualificationListInDb) { resetCrewQualTimeByCrewBaseAndTimezone(item, crewId, item->issuedUtc, item->renewedUtc, item->cancelUtc, item->expiryUtc, dataCtx, item->earliestUtc, item->latestUtc, item->baseMonthStartUtc); }
		for (auto& item : crew->teamList) { resetCrewTeamByCrewBaseAndTimezone(item, item->effDt, item->expDt, dataCtx); }
		for (auto& item : crew->guaranteeHourList) { resetCrewGuaranteeHourByCrewBaseAndTimezone(item, item->effDt, item->expDt, dataCtx); }
		for (auto& item : crew->statusList) { resetCrewStatusByCrewBaseAndTimezone(item, item->effDt, item->expdt, dataCtx); }
		for (auto& item : crew->crewFlyTogetherList) { resetCrewFlyTogetherByCrewBaseAndTimezone(item, item->effectiveDate, item->expiryDate, dataCtx); }
		for (auto& item : crew->crewFlyPreferenceList) { resetCrewFlyPreferencByCrewBaseAndTimezone(item, item->effectiveDate, item->expiryDate, dataCtx); }
		for (auto& item : crew->preferenceList) { resetCrewPreferenceByCrewBaseAndTimezone(item, item->strDtloc, item->endDtLoc, dataCtx); }
		for (auto& item : crew->entitlements) { resetCrewEntitlementByCrewBaseAndTimezone(item, item->effDt, item->expDt, dataCtx); }
		for (auto& item : crew->profiles) { resetCrewProfileByCrewBaseAndTimezone(item, item->effDt, item->expDt, dataCtx); }
	}
}


void resetCrewRankFleetQualLocalTimeToUtc(SharedPtr<CrewDataContext> dataCtx, const vector<string>& crewIdList) {
	for (auto& it : dataCtx->crewIdMap) {
		string crewId = it.first;
		if (!crewIdList.empty() && std::find(crewIdList.begin(), crewIdList.end(), crewId) == crewIdList.end()) {
			continue;
		}
		auto& crew = it.second;
		for (auto& item : crew->rankList) { resetCrewRankByCrewBaseAndTimezone(item, crewId, item->rank, item->effUtc, item->expUtc, dataCtx); }
		for (auto& item : crew->companyRankList) { resetCrewCompanyRankByCrewBaseAndTimezone(item, crewId, item->companyRank, item->effDt, item->expDt, dataCtx.get()); }
		for (auto& item : crew->fleetList) { resetCrewFleetByCrewBaseAndTimezone(item, crewId, item->fleet, item->effUtc, item->expUtc, dataCtx.get()); }
		for (auto& item : crew->qualificationList) { resetCrewQualTimeByCrewBaseAndTimezone(item, crewId, item->issuedUtc, item->renewedUtc, item->cancelUtc, item->expiryUtc, dataCtx.get(), item->earliestUtc, item->latestUtc, item->baseMonthStartUtc);	}
		for (auto& item : crew->qualificationListInDb) { resetCrewQualTimeByCrewBaseAndTimezone(item, crewId, item->issuedUtc, item->renewedUtc, item->cancelUtc, item->expiryUtc, dataCtx.get(), item->earliestUtc, item->latestUtc, item->baseMonthStartUtc);	}
		for (auto& item : crew->teamList) { resetCrewTeamByCrewBaseAndTimezone(item, item->effDt, item->expDt, dataCtx.get()); }
		for (auto& item : crew->guaranteeHourList) { resetCrewGuaranteeHourByCrewBaseAndTimezone(item, item->effDt, item->expDt, dataCtx.get()); }
		for (auto& item : crew->statusList) { resetCrewStatusByCrewBaseAndTimezone(item, item->effDt, item->expdt, dataCtx.get()); }
		for (auto& item : crew->crewFlyTogetherList) { resetCrewFlyTogetherByCrewBaseAndTimezone(item, item->effectiveDate, item->expiryDate, dataCtx.get()); }
		for (auto& item : crew->crewFlyPreferenceList) { resetCrewFlyPreferencByCrewBaseAndTimezone(item, item->effectiveDate, item->expiryDate, dataCtx.get()); }
		for (auto& item : crew->preferenceList) { resetCrewPreferenceByCrewBaseAndTimezone(item, item->strDtloc, item->endDtLoc, dataCtx.get()); }
		for (auto& item : crew->entitlements) { resetCrewEntitlementByCrewBaseAndTimezone(item, item->effDt, item->expDt, dataCtx.get()); }
		for (auto& item : crew->profiles) { resetCrewProfileByCrewBaseAndTimezone(item, item->effDt, item->expDt, dataCtx.get()); }
	}
}

//20180310 ain, mantis#2931, csv, crewBase.loc -> 
void resetCrewBaseUtcByLoc(CrewDataContext* dataCtx) {
	if (dataCtx->airportUtcOffsetMap.empty()) {
		Logger::getRuleLogger()->error("must load&init airport before calculating crewBase.utc");
		return;
	}
	for (auto& it : dataCtx->crewIdMap) {
		if (it.second == nullptr) {
			continue;
		}
		//按crew_base.loc计算 crew_base.utc
		for (auto& crewBase : it.second->baseList) {
			resetCrewBaseByBaseAndTimezone(crewBase, crewBase->idCrew, crewBase->base, crewBase->effLoc, crewBase->expLoc, dataCtx);
		}
	}
}

void resetHolidayLocalTimeToUtc(CrewDataContext* dataCtx) {
	for (auto& holiday : dataCtx->holidays) {
		string depZoneId = dataCtx->getAirportZoneId(holiday->city);
		int offsetTZMinutes = TimezoneUtils::GetTimezoneOffset(holiday->strDt, depZoneId);

		holiday->strDtUtc = holiday->strDt - (time_t)offsetTZMinutes * 60;
		holiday->endDtUtc = holiday->endDt - (time_t)offsetTZMinutes * 60 + 24 * 3600 - 1;
	}
}

//根据 sysParam['CREW_MANDAY_STORE_TIMEZONE']确定manday.utc对应时区
int computeMandayTimeZoneOffsetMinutes(CrewDataContext* dataCtx, SharedPtr<CREW>& crew, time_t utc) {
	string sysParamMandayTimezone = "";
	if (dataCtx->systemParamMap.find("CREW_MANDAY_STORE_TIMEZONE") != dataCtx->systemParamMap.end())
		string sysParamMandayTimezone = strToUpper(dataCtx->systemParamMap["CREW_MANDAY_STORE_TIMEZONE"]);
	if (sysParamMandayTimezone == "UTC") {
		return 0;
	}
	else if (sysParamMandayTimezone == "CREW_BASE" || sysParamMandayTimezone == "") {
		return crew->crewBaseTimezoneOffsetIndex->getOffsetMinutes(utc);
	}
	else {
		return dataCtx->getAirportOffsetMinutes(sysParamMandayTimezone);
	}
}

//修正数据：roster存在缺失roster_flt，针对cao等旧场景数据没有roster_flt情况
//补齐roster_flt按 actingRank=roster.actingRank, seqOrder=0
void fixDataMissingRosterFlight(CrewDataContext* dataCtx) {
	if (!dataCtx) {
		return;
	}
	int count = 0;
	for (auto& c : dataCtx->crewList) {
		for (auto& r : c->rosterList) {
			auto& p = dataCtx->pairingIdMap[r->pairId];
			if (!p) {
				continue;
			}
			for (auto& s : p->getSegments()) {
				if (s->getAssignment() == "FLY") {
					long long fltId = s->getDBId();
					string crewId = r->idcrew;
					auto rf = dataCtx->rosterFlightMgr.get(fltId, crewId);
					if (!rf) {
						//long long fltId, long long pairingId, long long dutyId, std::string crewId, int seqOrder, std::string fltDt, 
						//std::string assignment, std::string division, std::string actingRank, std::string checkType, std::string tsflag, std::string comments
						shared_ptr<RosterFlight> item(new RosterFlight(
							s->getDBId(),r->rosterId, r->pairId, s->getDutyId(),dataCtx->scenarioId,
							r->idcrew,  0, //seqOrder
							utcToUtcDtString(s->getStartTimeLocSch()), //fltDt
							s->getAssignment(), 
							p->getDivision(),
							r->actingRank,
							"", "", "","" //checkType, tsFlag, comment
						));

						dataCtx->rosterFlightMgr.add(item);
						count++;
					}
				}
			}
		}
	}
	Logger::getRuleLogger()->info("Fix Missing Roster_Flt, count={}", count);
}

void fixRosterByPairing(CrewDataContext* dbData) {
	if (!dbData) {
		return;
	}
	for (auto& it : dbData->rosterList) {
		auto& p = dbData->pairingIdMap[it->pairId];
		if (!p) {
			continue;
		}
		it->location = p->getBase();
		//it->setEndTimeUtcSch(p->getEndTimeUtcSch());

		/*2023/5/30 用pairingNode替换下面ELSE部分代码*/
		const vector<Duty *>& duties = p->getDutyVec();
		Duty * lastDuty = duties[duties.size() - 1];
		Duty * firstDuty = duties[0];

		shared_ptr<PairingDutyNode> dropoff = lastDuty->getLastDropoff();
		shared_ptr<PairingDutyNode> debrief = lastDuty->getLastDebrief();
		shared_ptr<PairingDutyNode> pickup = firstDuty->getFirstPickup();
		shared_ptr<PairingDutyNode> brief = firstDuty->getFirstBreif();

		if (dropoff && debrief && pickup && brief)
		{
			time_t endTmUTC = std::max(dropoff->getEndUtc(), debrief->getEndUtc());

			it->setRestStartUtcSch(std::max(endTmUTC, p->getEndTimeUtcSch()));
			it->setRestStartUtcAct(std::max(endTmUTC, p->getEndTimeUtcAct()));

			time_t endTmLoc = std::max(dropoff->getEndLoc(), debrief->getEndLoc());

			it->setRestStartLocAct(std::max((time_t)endTmLoc, p->getEndTimeLocAct()));
			it->setRestStartLocSch(std::max((time_t)endTmLoc, p->getEndTimeLocSch()));


			time_t startTmUTC = std::min(pickup->getStartUtc(), brief->getStartUtc());
			it->setStartTimeUtcAct(std::min(startTmUTC, p->getStartTimeUtcAct()));
			it->setStartTimeUtcSch(std::min(startTmUTC, p->getStartTimeUtcSch()));

			time_t startTmLoc = std::min(pickup->getStartLoc(), brief->getStartLoc());
			it->setStartTimeLocAct(std::min(startTmLoc, p->getStartTimeLocAct()));
			it->setStartTimeLocSch(std::min(startTmLoc, p->getStartTimeLocSch()));

			it->setEndTimeUtcSch(p->getEndTimeIncludingRestUtcSch());
			it->setEndTimeUtcAct(p->getEndTimeIncludingRestUtcAct());
			it->setEndTimeLocSch(p->getEndTimeIncludingRestLocSch());
			it->setEndTimeLocAct(p->getEndTimeIncludingRestLocAct());
		}
		else
		{
			it->setEndTimeUtcSch(p->getEndTimeIncludingRestUtcSch());
			it->setEndTimeUtcAct(p->getEndTimeUtcAct());
			it->setEndTimeLocSch(p->getEndTimeLocSch());
			it->setEndTimeLocAct(p->getEndTimeLocAct());
			it->setStartTimeUtcSch(p->getStartTimeUtcSch());
			it->setStartTimeUtcAct(p->getStartTimeUtcAct());
			it->setStartTimeLocSch(p->getStartTimeLocSch());
			it->setStartTimeLocAct(p->getStartTimeLocAct());
			Segment* s = p->getLastSegment();
			it->setRestStartLocAct(s->getEndTimeLocAct());
			it->setRestStartUtcAct(s->getEndTimeUtcAct());
			it->setRestStartLocSch(p->getEndTimeLocSch());
			it->setRestStartUtcSch(s->getEndTimeUtcSch());
		}
	}

	//20211011 ain, mantis#9363, ver 3.0,填充时间字段后按actStrUtc排序roster
	for (auto& it : dbData->crewIdMap) {
		auto& list = it.second->rosterList;
		std::sort(list.begin(), list.end(), [](shared_ptr<ROSTER>& a, shared_ptr<ROSTER>& b) {
			return a->actStrUtc < b->actStrUtc;
		});
	}

	//20211011 ain, ver 3.0, 针对rosterGround按 crewRank填充 roster.actingRank
	for (auto& it : dbData->crewIdMap) {
		auto& list = it.second->rosterList;
		for (auto& r : list) {
			if (r->actingRank == "") {
				auto& crew = it.second;
				auto crewRank = crew->getActiveRankInTimes(r->actStrUtc, r->actEndUtc);
				if (crewRank) {
					r->actingRank = crewRank->rank;
				}
				else {
					Logger::getRuleLogger()->error("ERROR: invalid data, no crewRank found for crew={} strUtc={} endUtc={} {} {}", 
						r->idcrew, utcToUtcString(r->actStrUtc), utcToUtcString(r->actEndUtc), r->duty, r->location);
				}
			}
		}
	}
}


//20210413 ain, mantis#9251, 因场景模式跨场景读取优化数据目前按 crewOnFlt格式读取 COF部分, rosterFlt修复|补齐逻辑添加基于COF修复rf
void fixRosterFlightByCOF(CrewDataContext* dbData) {
	if (!dbData) {
		return;
	}
	auto& mgr = dbData->rosterFlightMgr;

	for (auto& it : dbData->crewOnFlt) {
		for (auto& cof : it.second) {
			if (cof->fltId == 0 /*|| !dbData->isAssignmentInGroup(cof->assignment, "FLY")*/) {
				continue;
			}
			if (!dbData->isAssignmentInGroup(cof->assignment, "FLY") && !dbData->isAssignmentInGroup(cof->assignment, "MVO") && !dbData->isAssignmentInGroup(cof->assignment, "SBY")) {
				continue;
			}
			auto rf = mgr.get(cof->fltId, cof->crewId);
			if (!rf) {
				auto& crew = dbData->crewIdMap[cof->crewId];
				if (dbData->flightIdMap.find(cof->fltId) == dbData->flightIdMap.end()) {
					continue;
				}
				shared_ptr<RosterFlight> item(new RosterFlight(
					cof->fltId, 
					0, // roster_id 
					cof->pairingId, 
					0, // duty id
					dbData->scenarioId,
					cof->crewId, 
					0, //seqOrder
					"", //fltDt
					cof->assignment,
					crew->division,
					cof->actingRank,
					"", "", "","PA" //checkType, tsFlag, comment
					));
				
				dbData->rosterFlightMgr.add(item);
			}
		}
	}
}

//20201110 ain, mantis#8798,  修正补齐数据, 针对roster_flight缺失问题, 确保8072等依赖rosterFlt的法规正常
void fixRosterFlight(CrewDataContext* dbData) {
	if (!dbData) {
		return;
	}

	auto& mgr = dbData->rosterFlightMgr;
	auto& ptnMap = dbData->pairingIdMap;

	Logger::getRuleLogger()->info("before fixRosterFlight size={}", mgr.size());

	//20210413 ain, mantis#9251, 场景无RosterFlt时补齐逻辑需考虑 crew(COF), 改为crewIdMap以包含两部分crew
	//for (auto& crew : dbData->crewList) {
	for (auto& it : dbData->crewIdMap) {
		auto& crew = it.second;
		for (auto& roster : crew->rosterList) {
			if (roster->pairId == 0 || ptnMap.find(roster->pairId) == ptnMap.end()) {
				continue;
			}
			auto& pg = ptnMap[roster->pairId];
			if (!pg) {
				continue;
			}
			for (std::size_t i = 0; i < pg->getNumDuties(); i++) {
				Duty* duty = pg->getDuty(i);
				for (std::size_t j = 0; j < duty->getNumSegments(); j++) {
					Segment* seg = duty->getSegment(j);
					auto fltId = seg->getDBId();
					if (fltId == 0 || !dbData->isAssignmentInGroup(seg->getAssignment(), "FLY")) {
						continue;
					}
					auto rosterFlt = mgr.get(fltId, roster->idcrew);
					if (! rosterFlt) {
						rosterFlt = mgr.make(seg, roster->idcrew, roster->actingRank, crew->division);

						rosterFlt->scenarioId = dbData->scenario.scenarioId;
						rosterFlt->rosterId = roster->rosterId;
						rosterFlt->pairingId = pg->getDbId();
						rosterFlt->dutyId = duty->getDutyId();
						rosterFlt->seqOrder = 0;
						mgr.add(rosterFlt);
					}
				}
			}
		}
	}
	
	fixRosterFlightByCOF(dbData);

	Logger::getRuleLogger()->info("*after fixRosterFlight size={}", mgr.size());
}

//20180926 ain, mantis#4114, 增加检查 CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE 需要符合airline base定义
void checkSystemParameterDefaultTimezone(CrewDataContext* dataCtx) {
	if (dataCtx->systemParamMap.find("CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE") != dataCtx->systemParamMap.end()) {
		string defaultTimezone = dataCtx->systemParamMap["CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE"];
		bool matchAnyBase = false;
		for (auto& b : dataCtx->baseList) {
			if (b.base == defaultTimezone)
				matchAnyBase = true;
		}
		if (!matchAnyBase) {
			stringstream ss;
			for (auto& b : dataCtx->baseList) {
				ss << b.base << ",";
			}
			Logger::getRuleLogger()->error("ERROR: invalid data, system_parameter['CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE']={} not match any airline base:[{}]", defaultTimezone, ss.str());
		}
	}
}

void checkAssignment(CrewDataContext* dataCtx) {
	//检查segment.assinment是否在 assignment中存在
	for (auto& p : dataCtx->pairingList) {
		for (auto& d : p->getDutyVec()) {
			for (auto& s : d->getSegments()) {
				if (dataCtx->assignmentNameMap.find(s->getAssignment()) == dataCtx->assignmentNameMap.end()) {
					Logger::getRuleLogger()->error("ERROR: invalid data, segment.assignment={} in pairing={} not exist", s->getAssignment(), p->getDbId());
				}
			}
		}
	}
	//20200818 mantis#8574, 检查roster.assinment和rosterFlt.assignment是否在 assignment中存在
	for (auto& roster : dataCtx->rosterList) {
		if (dataCtx->assignmentNameMap.find(roster->qualifier) == dataCtx->assignmentNameMap.end()) {
			Logger::getRuleLogger()->error("ERROR: invalid data, roster.assignment={} in rosterId={} not exist", roster->qualifier, roster->rosterId);
		}
	}
	for (auto& crew : dataCtx->crewList) {
		for (auto& rosterFlt : dataCtx->rosterFlightMgr.get(crew->idCrew)) {
			if (dataCtx->assignmentNameMap.find(rosterFlt->assignment) == dataCtx->assignmentNameMap.end()) {
				Logger::getRuleLogger()->error("ERROR: invalid data, rosterFlt.assignment={} in rosterFltId={} not exist", rosterFlt->assignment, rosterFlt->id);
			}
		}
	}
}

void checkRoster(CrewDataContext* dataCtx) {
	for (auto& crew : dataCtx->crewList) {
		for (auto& roster : crew->rosterList) {
			//20181011 ain, mantis#4227, 数据检查啊roster.location是否为空
			if (roster->location == "") {
				Logger::getRuleLogger()->error("ERROR: invalid data, roster.location is null, rosterId={}", roster->rosterId);
			}
				
			if (dataCtx->crewIdMap.find(roster->idcrew) == dataCtx->crewIdMap.end()) {
				Logger::getRuleLogger()->error("ERROR: invalid data, crew not found for rosterId={}", roster->rosterId);
			}
				
		}
	}
}

string fltInfo(long long fltId, CrewDataContext* dbData) {
	if (!dbData) {
		return "";
	}
	auto iterFlt = dbData->flightIdMap.find(fltId);
	if (iterFlt == dbData->flightIdMap.end()) {
		return "";
	}
	SharedPtr<Segment> flt = iterFlt->second;
	stringstream ss;
	ss << fltId << " " << flt->getFlightNumber() << " " << utcToUtcDtString(flt->getStartTimeLocAct());
	return ss.str();
}