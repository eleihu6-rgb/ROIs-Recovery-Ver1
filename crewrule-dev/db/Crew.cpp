#include <stdio.h>
#include <sstream>
#include <vector>
#include <algorithm>

#include <iostream>
#include <time.h>
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "TestDBFunc.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "OrLog.h"
#include "Log/Logger.h"

using namespace std;


CREW::CREW() { _isLegal = true; }
CREW::CREW(const CREW& obj) {
	this->idCrew = obj.idCrew;
	this->qualificationList = obj.qualificationList;
	this->qualListFiltedByRules = obj.qualListFiltedByRules;
	this->fleetList = obj.fleetList;
	this->rankList = obj.rankList;
	this->companyRankList = obj.companyRankList;
	this->baseList = obj.baseList;
	this->mandayFdList = obj.mandayFdList;
	this->mandayCcAmList = obj.mandayCcAmList;
	this->rosterList = obj.rosterList;
	this->firstName = obj.firstName;
	this->midName = obj.midName;
	this->lastName = obj.lastName;
	this->preferredName = obj.preferredName;
	this->alias = obj.alias;
	this->initials = obj.initials;
	this->title = obj.title;
	this->gender = obj.gender;
	this->division = obj.division;
	this->emplUtc = obj.emplUtc;
	this->emplNum = obj.emplNum;
	this->permUtc = obj.permUtc;
	this->retireUtc = obj.retireUtc;
	this->termUtc = obj.termUtc;
	this->emplStatus = obj.emplStatus;
	this->seniorityCode = obj.seniorityCode;
	this->seniorityNum = obj.seniorityNum;
	this->latestStrUtc = obj.latestStrUtc;
	this->departmentCode = obj.departmentCode;
	this->airline = obj.airline;

	
	//this->birthdayUtc = obj.birthdayUtc;
	memcpy(&this->birthdayTm, &obj.birthdayTm, sizeof(tm));
	this->birthCity = obj.birthCity;
	this->birthState = obj.birthState;
	this->birthCountry = obj.birthCountry;
	this->nationality = obj.nationality;
	this->natinalIdentification = obj.natinalIdentification;
	this->spouseIdcrew = obj.spouseIdcrew;
	this->prevIdcrew = obj.prevIdcrew;
	this->passportFirstName = obj.passportFirstName;
	this->passportMidName = obj.passportMidName;
	this->passportLastName = obj.passportLastName;
	this->remark = obj.remark;
	this->idUser = obj.idUser;
	this->tmst = obj.tmst;
	//SGQ
	this->_isLegal = obj._isLegal;
	this->_vilation_messages = obj._vilation_messages;
	this->lastPublishDate = obj.lastPublishDate;
}

//计算指定日期年纪
double CREW::getAgeByTime(time_t timeUtc){
    if (timeUtc < 0) {
		return -1;
	}
	struct tm inputTm = { 0 };
	time_t utc = timeUtc;
	int year = 0;
	int birthdayOfYear = 0;
	int inputDayOfYear = 0;

	memcpy(&inputTm, localtime(&utc), sizeof(inputTm));
	year = inputTm.tm_year - this->birthdayTm.tm_year;
	birthdayOfYear = dayOfYear(this->birthdayTm.tm_mon, this->birthdayTm.tm_mday);
	inputDayOfYear = dayOfYear(inputTm.tm_mon, inputTm.tm_mday);

	return year + (inputDayOfYear - birthdayOfYear) / 365.0;
}

string CREW::getPrimeBase() {
	int i = 0;
	if (this->baseList.empty()) {
		return "";
	}
	else {
		// mantis#6482, 组员有多个prime base时, 取最新的
		for (i = (int)this->baseList.size() - 1; i >= 0; i--) {
			if (baseList[i]->isPrime)
				return baseList[i]->base;
		}
		return baseList[baseList.size() - 1]->base;
	}
}

string CREW::getCrewBase(time_t timeUtc)
{
	for (std::size_t i = 0; i < this->baseList.size(); i++)
	{
		if (baseList[i]->effUtc <= timeUtc && baseList[i]->expUtc > timeUtc)
		{
			return baseList[i]->base;
		}
	}
	return "";
}

SharedPtr<CREW_RANK> CREW::getActiveRankInTimes(time_t start, time_t end, string fleet)
{
	if (this->rankList.size() == 0)
		return NULL;
	time_t eff = 0, exp = 0;
	for (auto& rank : this->rankList)
	{
		eff = rank->effUtc;
		exp = rank->expUtc;
		if (eff <= 0)
			eff = start;
		if (exp <= 0)
			exp = end;

		if (!(end<eff || start>exp))
		{
			if (fleet != "") {
				if (fleet == rank->acType) {
					return rank;
				}
				else {
					continue;
				}
			}
			return rank;
		}
	}
	return NULL;
}

vector<SharedPtr<GuaranteeFlyHours>> CREW::getGuaranteeFlyingHours(const time_t localDay) const {
	vector<SharedPtr<GuaranteeFlyHours>> tmpGuaranteeFlyHours;
	if (this->guaranteeFlyHoursList.size() == 0)
		return tmpGuaranteeFlyHours;
	time_t effLocal = 0, expLocal = 0;
	for (auto& guaranteeFlyHours : this->guaranteeFlyHoursList)
	{
		effLocal = guaranteeFlyHours->effDt;
		expLocal = guaranteeFlyHours->expDt;
		if (localDay >= effLocal && localDay < expLocal) {
			tmpGuaranteeFlyHours.push_back(guaranteeFlyHours);
		}
	}
	return std::move(tmpGuaranteeFlyHours);
}

int CREW::getGuaranteeFlyingHour(const time_t localDay) const {
	int flyingHours = -1;
	vector<SharedPtr<GuaranteeFlyHours>> guaranteeFlyHours = getGuaranteeFlyingHours(localDay);
	if (!guaranteeFlyHours.empty()) {
		//flyingHours = guaranteeFlyHours

		// 自定义比较函数，按照从大到小排序
		auto compare = [](SharedPtr<GuaranteeFlyHours> src, SharedPtr<GuaranteeFlyHours> dest) 
			{ return src->guaranteeFlyingHour < dest->guaranteeFlyingHour; };
		//获得多个GuaranteeFlyHours，返回 guaranteeFlyingHour值最大的对象
		auto result = std::max_element(guaranteeFlyHours.begin(), guaranteeFlyHours.end(), compare);
		flyingHours = (*result)->guaranteeFlyingHour;
	}
	return flyingHours;
}

int CREW::getGuaranteeHour(const time_t localDay) const {
	int hour = -1;//单位：分钟
	for (auto& guaranteeHour : this->guaranteeHourList) 
	{
		time_t effLocal = guaranteeHour->effDt;
		time_t expLocal = guaranteeHour->expDt;
		if (localDay >= effLocal && localDay <= expLocal) {
			hour = guaranteeHour->guaranteeHour;
			break;
		}
	}
	return hour;
}

void CREW::makeAvgAnnGuaranteeHour() {
	for (auto& guaranteeHour : this->guaranteeHourList) {
		int year = Utility::GetInstancePtr()->getYear(guaranteeHour->effDt);
		//guarantee hour(minutes) × 12 months / 365 days
		avgAnnGuaranteeHourMap[year] = (guaranteeHour->guaranteeHour * 12 * 1.0) / 365;
	}
}

void CREW::makeRosterValidity() {
	for (auto& roster : this->rosterList) {
		makeRosterValidity(roster);
	}
}

void CREW::makeRosterValidity(std::shared_ptr<ROSTER>& roster) {
	if (roster->idcrew != this->idCrew) {
		return;
	}
	roster->validBasesList.clear();
	roster->validFleetsList.clear();
	roster->validRanksList.clear();
	roster->validPositionsList.clear();
	roster->validQualsList.clear();
	roster->validTeamsList.clear();

	time_t INVALID_TIME = utcStrToUtc("9999-12-31");

	time_t startTime = roster->actStrUtc;
	time_t endTime = roster->actRestStrUtc;
	if (roster->pairing != nullptr) {
		startTime = roster->pairing->getStartTimeUtcAct();
		endTime = roster->pairing->getEndTimeUtcAct();
	}

	for (const auto& base : this->baseList)
	{
		if ((base->effUtc <= startTime) && (base->expUtc < 0 || base->expUtc > endTime)	)
		{
			roster->validBasesList.emplace(base->base);
		}
	}

	for (const auto& fleet : this->fleetList)
	{
		if ((fleet->effUtc <= startTime) && (fleet->expUtc < 0 || fleet->expUtc > endTime))
		{
			roster->validFleetsList.emplace(fleet->fleet);
		}
	}

	for (const auto& rank : this->rankList)
	{
		if ((rank->effUtc <= startTime) && (rank->expUtc < 0 || rank->expUtc > endTime))
		{
			roster->validRanksList.emplace(rank->rank);
			roster->validPositionsList.emplace(rank->position);
		}
	}

	for (const auto& qual : this->qualificationList)
	{
		time_t effUtc = (qual->issuedUtc == INVALID_TIME) ? INT_MIN : qual->issuedUtc;
		time_t expUtc = (qual->expiryUtc == INVALID_TIME) ? INT_MAX : qual->expiryUtc;

		if ((effUtc <= startTime) && (expUtc < 0 || expUtc > endTime))
		{
			roster->validQualsList.emplace(qual->qual);
		}
	}

	for (const auto& team : this->teamList)
	{
		if ((team->effDt <= startTime) && (team->expDt < 0 || team->expDt > endTime))
		{
			roster->validTeamsList.emplace(team->teamName);
		}
	}
}

void CREW::clear() {
	this->_vilation_messages.clear();
}

//对crew内 crew_base/fleet/rank/qual按eff_dt排序
void sortCrewData(vector<SharedPtr<CREW>>& crews) {
	Logger::getRuleLogger()->info("{} >> sortCrewData", utcToUtcString(time(NULL)).c_str());
	for (auto& crew : crews) {
		stable_sort(crew->baseList.begin(), crew->baseList.end(), [](const SharedPtr<CREW_BASE>& i, const SharedPtr<CREW_BASE>& j) { return i->effUtc < j->effUtc; });
		stable_sort(crew->fleetList.begin(), crew->fleetList.end(), [](const SharedPtr<CREW_FLEET>& i, const SharedPtr<CREW_FLEET>& j) { return i->effUtc < j->effUtc; });
		stable_sort(crew->rankList.begin(), crew->rankList.end(), [](const SharedPtr<CREW_RANK>& i, const SharedPtr<CREW_RANK>& j) { return i->effUtc < j->effUtc; });
		stable_sort(crew->companyRankList.begin(), crew->companyRankList.end(), [](const SharedPtr<CREW_COMPANY_RANK>& i, const SharedPtr<CREW_COMPANY_RANK>& j) { return i->effDt < j->effDt; });
		stable_sort(crew->qualificationList.begin(), crew->qualificationList.end(), [](const SharedPtr<CREW_QUALIFICATION>& i, const SharedPtr<CREW_QUALIFICATION>& j) { return i->issuedUtc < j->issuedUtc; });
		stable_sort(crew->qualificationListInDb.begin(), crew->qualificationListInDb.end(), [](const SharedPtr<CREW_QUALIFICATION>& i, const SharedPtr<CREW_QUALIFICATION>& j) { return i->issuedUtc < j->issuedUtc; });
		stable_sort(crew->statusList.begin(), crew->statusList.end(), [](const SharedPtr<CREW_STATUS>& i, const SharedPtr<CREW_STATUS>& j) { return i->effDt < j->effDt; });
		stable_sort(crew->teamList.begin(), crew->teamList.end(), [](const SharedPtr<CREW_TEAM>& i, const SharedPtr<CREW_TEAM>& j) { return i->effDt < j->effDt; });
		stable_sort(crew->preferenceList.begin(), crew->preferenceList.end(), [](const SharedPtr<CREW_PREFERENCE>& i, const SharedPtr<CREW_PREFERENCE>& j) { return i->strDtloc < j->strDtloc; });
	}
	Logger::getRuleLogger()->info("{} << sortCrewData", utcToUtcString(time(NULL)).c_str());
}


//假设crews和crewRanks都以按idcrew有序排列，从头遍历两列表建立关于idcrew的关联
void makeIndexCrewRank(vector<SharedPtr<CREW>> &crews, vector<SharedPtr<CREW_RANK>> &crewRanks) {
	std::size_t crewIndex = 0;
	std::size_t rankIndex = 0;
	
	for (crewIndex = 0; crewIndex < crews.size(); crewIndex++) {
		SharedPtr<CREW> &crew = crews[crewIndex];

		while (rankIndex < crewRanks.size()) {
			SharedPtr<CREW_RANK> &rank = crewRanks[rankIndex];

			if (rank->idCrew.compare(crew->idCrew) < 0) {

			} else if (rank->idCrew.compare(crew->idCrew) == 0) {
				crew->rankList.push_back(rank);

			} else {
				break;
			}
			rankIndex++;
		}

	}
}

//假设crews和crewBases都以按idcrew有序排列，从头遍历两列表建立关于idcrew的关联
void makeIndexCrewBase(vector<SharedPtr<CREW>> &crews, vector<SharedPtr<CREW_BASE>> &crewBases) {
	std::size_t crewIndex = 0;
	std::size_t baseIndex = 0;

	for (crewIndex = 0; crewIndex < crews.size(); crewIndex++) {
		SharedPtr<CREW> &crew = crews[crewIndex];

		while (baseIndex < crewBases.size()) {
			SharedPtr<CREW_BASE> &base = crewBases[baseIndex];
			if (base->idCrew.compare(crew->idCrew) < 0) {
			//	Logger::getRuleLogger()->info("no crew match for base");
			} else if (base->idCrew.compare(crew->idCrew) == 0) {
				crew->baseList.push_back(base);

			} else {
				break;
			}
			baseIndex++;
		}

	}
}


//假设crews和crewPreference都以按idcrew有序排列，从头遍历两列表建立关于idcrew的关联
void makeIndexCrewPreference(vector<SharedPtr<CREW>> &crews, vector<SharedPtr<CREW_PREFERENCE>> &datas) {
	std::size_t crewIndex = 0;
	std::size_t dataIndex = 0;

	for (crewIndex = 0; crewIndex < crews.size(); crewIndex++) {
		SharedPtr<CREW> &crew = crews[crewIndex];

		while (dataIndex < datas.size()) {
			SharedPtr<CREW_PREFERENCE> &data = datas[dataIndex];
			if (data->idCrew.compare(crew->idCrew) < 0) {
				//	Logger::getRuleLogger()->info("no crew match for base");
			}
			else if (data->idCrew.compare(crew->idCrew) == 0) {
				crew->preferenceList.push_back(data);

			}
			else {
				break;
			}
			dataIndex++;
		}

	}
}

//假设crews和crewStatus都以按idcrew有序排列，从头遍历两列表建立关于idcrew的关联
void makeIndexCrewStatus(vector<SharedPtr<CREW>> &crews, vector<SharedPtr<CREW_STATUS>> &datas) {
	std::size_t crewIndex = 0;
	std::size_t dataIndex = 0;

	for (crewIndex = 0; crewIndex < crews.size(); crewIndex++) {
		SharedPtr<CREW> &crew = crews[crewIndex];

		while (dataIndex < datas.size()) {
			SharedPtr<CREW_STATUS> data = datas[dataIndex];
			if (data->idcrew.compare(crew->idCrew) < 0) {
				//	Logger::getRuleLogger()->info("no crew match for base");
			}
			else if (data->idcrew.compare(crew->idCrew) == 0) {
				crew->statusList.push_back(data);

			}
			else {
				break;
			}
			dataIndex++;
		}

	}
}
//假设crews和crewFleets都以按idcrew有序排列，从头遍历两列表建立关于idcrew的关联
void makeIndexCrewFleet(vector<SharedPtr<CREW>> &crews, vector<SharedPtr<CREW_FLEET>> &crewFleets) {
	std::size_t crewIndex = 0;
	std::size_t fleetIndex = 0;

	for (crewIndex = 0; crewIndex < crews.size(); crewIndex++) {
		SharedPtr<CREW> &crew = crews[crewIndex];

		while (fleetIndex < crewFleets.size()) {
			SharedPtr<CREW_FLEET> &fleet = crewFleets[fleetIndex];
			if (fleet->idCrew.compare(crew->idCrew) < 0) {

			} else if (fleet->idCrew.compare(crew->idCrew) == 0) {
				crew->fleetList.push_back(fleet);

			} else {
				break;
			}
			fleetIndex++;
		}
	}
}

//假设crews和crewFleets都以按idcrew有序排列，从头遍历两列表建立关于idcrew的关联
void makeIndexCrewQualification(vector<SharedPtr<CREW>> &crews, vector<SharedPtr<CREW_QUALIFICATION>> &crewQuals) {
	std::size_t crewIndex = 0;
	std::size_t qualIndex = 0;

	for (crewIndex = 0; crewIndex < crews.size(); crewIndex++) {
		SharedPtr<CREW> &crew = crews[crewIndex];

		while (qualIndex < crewQuals.size()) {
			SharedPtr<CREW_QUALIFICATION> &qual = crewQuals[qualIndex];
			if (qual->idCrew.compare(crew->idCrew) < 0) {

			} else if (qual->idCrew.compare(crew->idCrew) == 0) {
				crew->qualificationList.push_back(qual);

			} else {
				break;
			}
			qualIndex++;
		}
	}
}

//
void   makeIndexCrewMandayFd      (vector<SharedPtr<CREW>> &crews, vector<SharedPtr<CREW_MANDAY_FD>> &crewMandayFds) {
	std::size_t crewIndex = 0;
	std::size_t mandayIndex = 0;
	int count = 0;

	for (crewIndex = 0; crewIndex < crews.size(); crewIndex++) {
		SharedPtr<CREW> &crew = crews[crewIndex];

		while (mandayIndex < crewMandayFds.size()) {
			SharedPtr<CREW_MANDAY_FD> &manday = crewMandayFds[mandayIndex];
			if (manday->idCrew.compare(crew->idCrew) < 0) {

			} else if (manday->idCrew.compare(crew->idCrew) == 0) {
				crew->mandayFdList.push_back(manday);
				count++;

			} else {
				break;
			}
			mandayIndex++;
		}
	}
	//Logger::getRuleLogger()->info("{} count of mandayFD index: {}", (int)time(0)%3600, count);
}


void   makeIndexCrewMandayCcAm(vector<SharedPtr<CREW>> &crews, vector<SharedPtr<CREW_MANDAY_CC_AM>> &mandayList) {
	std::size_t crewIndex = 0;
	std::size_t mandayIndex = 0;
	int count = 0;

	for (crewIndex = 0; crewIndex < crews.size(); crewIndex++) {
		SharedPtr<CREW> crew = crews[crewIndex];

		while (mandayIndex < mandayList.size()) {
			SharedPtr<CREW_MANDAY_CC_AM> &manday = mandayList[mandayIndex];
			if (manday->idCrew.compare(crew->idCrew) < 0) {

			}
			else if (manday->idCrew.compare(crew->idCrew) == 0) {
				crew->mandayCcAmList.push_back(manday);
				count++;

			}
			else {
				break;
			}
			mandayIndex++;
		}
	}
	//Logger::getRuleLogger()->info("{} count of mandayFD index: {}", (int)time(0) % 3600, count);
}

//排序
bool compareCrewRefById(SharedPtr<CREW> & i, SharedPtr<CREW> & j)  {
	return (i->idCrew.compare(j->idCrew) < 0);
}

void resetCrewMandayDateToUtc(CrewDataContext* dbData) {

	//if (dbData->systemParamMap["CREW_MANDAY_STORE_TIMEZONE"] != "CREW_BASE") {
	//	return;
	//}
	time_t nowInUtc = time(0);
	for (auto& it : dbData->crewIdMap) {
		SharedPtr<CREW>& crew = it.second;
		
		for (auto& mday : crew->mandayCcAmList) {
			time_t t = mday->dateLoc;
			int offsetMinutes = crew->crewBaseTimezoneOffsetIndex->getOffsetMinutes(t);
			mday->crewDateUtc = t - offsetMinutes * 60;
		}
		//20180404 ain, mantis#3090, csv, publish_manday.utc=loc-offset
		for (auto& mday : crew->publishedMandayCcAmList) {
			time_t t = mday->dateLoc;
			int offsetMinutes = crew->crewBaseTimezoneOffsetIndex->getOffsetMinutes(t);
			mday->crewDateUtc = t - offsetMinutes * 60;
		}
		for (auto& mday : crew->mandayFdList) {
			time_t t = mday->dateLoc;
			int offsetMinutes = crew->crewBaseTimezoneOffsetIndex->getOffsetMinutes(t);
			mday->crewDateUtc = t - offsetMinutes * 60;
			time_t nowLocalDayInUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(nowInUtc, offsetMinutes);//系统时间转换成本地时间所在天（UTC时区)
			mday->recalFleetLanding = (mday->crewDateUtc >= nowLocalDayInUtc);//今天和未来时间重新计算FleetLanding
		}
	}
}

void makeIndexCrewBaseRankFleet( CrewDataContext* dbData, const set<string> updatedCrewIds) {

	//CrewBaseTimezoneIndex
	for (auto& it : dbData->crewIdMap) {
		SharedPtr<CREW>& crew = it.second;
		if (!updatedCrewIds.empty() && updatedCrewIds.find(crew->idCrew) == updatedCrewIds.end()) {
			continue;
		}
		crew->crewBaseTimezoneOffsetIndex = SharedPtr<CrewBaseTimezoneIndex>(new CrewBaseTimezoneIndex(crew->idCrew, crew->baseList, dbData));
	}

	if ((dbData->endUtc - dbData->startUtc) / (24 * 3600) + 1 >= 180) {
		Logger::getRuleLogger()->info("scenario period > 180 days, skip makeIndexCrewBaseRankFleet()");
		return;
	}

	//IndexCrewBaseRankFleetDayItemConfig
	map<string, string> nameMap;
	vector<string> nameList;
	string type = "";
	shared_ptr<IndexCrewBaseRankFleetDayItemConfig> config(new IndexCrewBaseRankFleetDayItemConfig);
	try {
		IndexCrewBaseRankFleet::init(dbData->airportUtcOffsetMap);

		type = "base";
		for (SharedPtr<CREW>& crew : dbData->crewTotalList) {
			if (!updatedCrewIds.empty() && updatedCrewIds.find(crew->idCrew) == updatedCrewIds.end()) {
				continue;
			}
			for (auto& cb : crew->baseList) {
				if (nameMap.find(cb->base) == nameMap.end())
					nameMap[cb->base] = "base";
				else if (nameMap[cb->base] != "base")
					Logger::getRuleLogger()->info("ERROR: invalid data, duplicate name {} between crew_base and other", cb->base.c_str());
			}
		}
		for (auto& it : nameMap)
			nameList.push_back(it.first);
		nameList.push_back("*"); //20170331 add by ain
		//IndexCrewBaseRankFleet::init(type, nameList);
		config->init(type, nameList);

	}
	catch (...) {
		cout << "ERROR: init crew base/rank/fleet index fail\n";
	}


	//generate item
	int crewCount = 0;
	time_t startLocIncludeLeadin = utcToLocal(dbData->scenario.startDtUTC) - 24 * 3600 * atoi(dbData->systemParamMap["DEFAULT_LEADIN_DAYS_PRIOR_ROSTER_PERIOD"].c_str());
	time_t endLocIncludeLeadout = utcToLocal(dbData->scenario.endDtUTC) + (24 * 3600 - 1) + 24 * 3600 * atoi(dbData->systemParamMap["DEFAULT_LEADOUT_DAYS_POST_ROSTER_PERIOD"].c_str());
	for (SharedPtr<CREW>& crew : dbData->crewTotalList) {
		if (!updatedCrewIds.empty() && updatedCrewIds.find(crew->idCrew) == updatedCrewIds.end()) {
			continue;
		}
		crewCount++;
		try {
			//generate index
			//IndexCrewBaseRankFleet index(dbData->startUtc, dbData->endUtc);
			crew->index = SharedPtr<IndexCrewBaseRankFleet>(new IndexCrewBaseRankFleet(startLocIncludeLeadin, endLocIncludeLeadout, config));
			type = "base";
			for (auto& cb : crew->baseList) {
				time_t effLoc = cb->effUtc + 60 * dbData->getCrewBaseOffsetMinutes(crew->idCrew, cb->effUtc);
				time_t expLoc = cb->expUtc + 60 * dbData->getCrewBaseOffsetMinutes(crew->idCrew, cb->expUtc);
				crew->index->addIndexValue(type, cb->base, effLoc, expLoc);
			}
			//type = "rank";
			//for (auto& cb : crew->rankList) {
			//	time_t effLoc = cb->effUtc + 60 * dbData->getCrewBaseOffsetMinutes(crew->idCrew, cb->effUtc);
			//	time_t expLoc = cb->expUtc + 60 * dbData->getCrewBaseOffsetMinutes(crew->idCrew, cb->expUtc);
			//	crew->index->addIndexValue(type, cb->rank, effLoc, expLoc);
			//}
			//type = "fleet";
			//for (auto& cb : crew->fleetList) {
			//	time_t effLoc = cb->effUtc + 60 * dbData->getCrewBaseOffsetMinutes(crew->idCrew, cb->effUtc);
			//	time_t expLoc = cb->expUtc + 60 * dbData->getCrewBaseOffsetMinutes(crew->idCrew, cb->expUtc);
			//	crew->index->addIndexValue(type, cb->fleet, effLoc, expLoc);
			//}
			//type = "qual";
			//for (auto& cb : crew->qualificationList) {
			//	time_t effLoc = cb->issuedUtc + 60 * dbData->getCrewBaseOffsetMinutes(crew->idCrew, cb->issuedUtc);
			//	time_t expLoc = cb->expiryUtc + 60 * dbData->getCrewBaseOffsetMinutes(crew->idCrew, cb->expiryUtc);
			//	crew->index->addIndexValue(type, cb->qual, effLoc, expLoc);
			//}
		}
		catch (char * e) {
			cout << "ERROR: init crew base/rank/fleet index fail, crew=" << crew->idCrew << ", ex=" << e << ", type=" << type << " count=" << crewCount << "\n";
		}
		catch (exception& e) {
			cout << "ERROR: init crew base/rank/fleet index fail, crew=" << crew->idCrew << ", ex=" << e.what() << ", type=" << type << " count=" << crewCount << "\n";
		}
		catch (...) {
			cout << "ERROR: init crew base/rank/fleet index fail, crew=" << crew->idCrew << ", type=" << type << " count=" << crewCount << "\n";
		}
	}
}

void makeIndexCrewKpiAdjust(CrewDataContext* dbData, const set<string> updatedCrewIds) {
	//CrewKpiAdjustTimeIndex
	for (auto& it : dbData->crewIdMap) {
		SharedPtr<CREW>& crew = it.second;
		if (!updatedCrewIds.empty() && updatedCrewIds.find(crew->idCrew) == updatedCrewIds.end()) {
			continue;
		}
		crew->crewKpiAdjustTimeIndex = std::make_shared<CrewKpiAdjustTimeIndex>(crew->crewKpiAdjustList);
	}
}