#include <stdio.h>
#include <vector>
#include <iostream>

#include <algorithm>
#include <time.h>
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "UtilFunc.h"
#include "TestDBFunc.h"
#include "Utility.h"
#include "RuleParams.h"

using namespace std;


// 原子变量不能使用拷贝构造，这个限制只在原子变量初始时生效，初始之后可以通过赋值操作符
// 可以使用直接初始化或列表初始化来解决这个报错
// 2022/7/21 haoli
static atomic<unsigned long long> g_roster_created(0);
static atomic<unsigned long long> g_roster_removed(0);

void ROSTER::printInstanceCount(string msg) {
	cout << "roster count '" << msg << "'  " << ((unsigned long long)g_roster_created - (unsigned long long)g_roster_removed) << " constructed:" << g_roster_created << " destructed:" << g_roster_removed << endl;
}

ROSTER::~ROSTER() {
	g_roster_removed++;
}

ROSTER::ROSTER() {
	g_roster_created++;

	_isLegal = true;
	needRuleCheck = true;
	pairing = NULL;
	pairId = 0;
	rosterId = 0;

	idscenario = 0;
	sourceType = 0; //是否预占: ROSTER_SOURCE_PRE_ASSIGN or ROSTER_SOURCE_OR
	brief = 0;
	debrief = 0;
	strUtc = 0;
	restStrUtc = 0;
	endUtc = 0;
	actStrUtc = 0;
	actRestStrUtc = 0;
	actEndUtc = 0;
	notifiedTmst = 0;
	publishedUtc = 0;
	calloutUtc = 0;
	allocTmst = 0;
	totalPayTime = 0;
	tmst = 0;
	pairing = NULL;
	indexInRosterListOfCrew = 0;  //Roster 在所属crew中rosterList内的索引位置，从 0开始计数
	isRequested = false;

	tmGroupId = "";
	tmProgramCourseId = 0;
	tmResourceCode = "";
	tmRole = "";

	isAgreeWork = 0;

	attribute = "";

	exceptionCode = "";
	exceptionCodes.clear();
}


string ROSTER::getBase() const
{
	if (this->pairing)
		return this->pairing->getBase();
	else
		return this->location;
}

vector<Duty*> ROSTER::getOperatingDuties() const
{
	vector<Duty*> reDuties;
	if (this->pairing)
	{
		vector<Duty*> duties = this->pairing->getDutyVec();
		for (vector<Duty*>::iterator duty = duties.begin(); duty != duties.end(); duty++)
		{
			Duty::DUTY_TYPE dt = (*duty)->getType();
			if (dt != Duty::DUTY_FLY && dt != Duty::DUTY_PURE_OPR){
				continue;
			}
			reDuties.push_back((*duty));
		}
	}
	return reDuties;
}

//true for 'roster.idsenario in scenario_group and not current scenario'
//false for others
bool ROSTER::isFromGroupBrotherScenario(vector<long long>& groupBrotherScenario) const {
	for (auto& id : groupBrotherScenario) {
		if (id == this->idscenario)
			return true;
	}
	return false;
}

//信息摘要str: dutyType label startDateLoc
string ROSTER::toReadableStr() {
	stringstream ss;
	ss << this->duty << " " << this->label << " " << utcToUtcDtString(strLoc);
	return ss.str();
}

//return operating fly segments
vector<Segment*> ROSTER::getOperatingSegments() const
{
	vector<Segment*> retSegments;
	if (this->pairing)
	{
		vector<Duty*> duties = this->pairing->getDutyVec();
		for (vector<Duty*>::iterator duty = duties.begin(); duty != duties.end(); duty++)
		{
			Duty::DUTY_TYPE dt = (*duty)->getType();

			if (dt != Duty::DUTY_FLY && dt != Duty::DUTY_PURE_OPR){
				continue;
			}

			vector<Segment*> segments = (*duty)->getSegments();

			for (vector<Segment*>::iterator segment = segments.begin(); segment != segments.end(); segment++)
			{
				if ((*segment)->getIsOperating())
					retSegments.push_back((*segment));
			}

		}
	}
	return retSegments;
};
std::size_t ROSTER::getDutyNums() const {
	if (this->pairId != 0 && this->pairing) {
		return this->pairing->getNumDuties();
	}
	else {
		return 0;
	}

}

void ROSTER::setStartTimeUtcSch(time_t vl){ strUtc = vl; }
time_t ROSTER::getStartTimeUtcSch() const { return strUtc; }
void ROSTER::setEndTimeUtcSch(time_t vl){ endUtc = vl; }
time_t ROSTER::getEndTimeUtcSch() const { return endUtc; }
void ROSTER::setStartTimeLocSch(time_t vl){ strLoc = vl; }
time_t ROSTER::getStartTimeLocSch() const { return strLoc; }
void ROSTER::setEndTimeLocSch(time_t vl){ endLoc = vl; }
time_t ROSTER::getEndTimeLocSch() const { return endLoc; }
void ROSTER::setStartTimeUtcAct(time_t vl){ actStrUtc = vl; }
time_t ROSTER::getStartTimeUtcAct() const { return actStrUtc; }
void ROSTER::setEndTimeUtcAct(time_t vl){ actEndUtc = vl; }
time_t ROSTER::getEndTimeUtcAct() const { return actEndUtc; }
void ROSTER::setStartTimeLocAct(time_t vl){ actStrLoc = vl; }
time_t ROSTER::getStartTimeLocAct() const { return actStrLoc; }
void ROSTER::setEndTimeLocAct(time_t vl){ actEndLoc = vl; }
time_t ROSTER::getEndTimeLocAct() const { return actEndLoc; }

void ROSTER::setRestStartUtcSch(time_t v) {
	restStrUtc = v;
}
time_t ROSTER::getRestStartUtcSch() const {
	return restStrUtc;
}
time_t ROSTER::getRestStarUtcSch() const {
	return restStrUtc;
}
void ROSTER::setRestStartLocSch(time_t v) {
	restStrLoc = v;
}
time_t ROSTER::getRestStartLocSch() const {
	return restStrLoc;
}
void ROSTER::setRestStartUtcAct(time_t v) {
	actRestStrUtc = v;
}
time_t ROSTER::getRestStartUtcAct() const {
	return actRestStrUtc;
}
void ROSTER::setRestStartLocAct(time_t v) {
	actRestStrLoc = v;
}
time_t ROSTER::getRestStartLocAct() const {
	return actRestStrLoc;
}

bool ROSTER::isTrainingRoster() const {
	return tmProgramCourseId > 0;
}

bool ROSTER::isAllValid(const vector<string>& bases, const vector<string>& ranks, const vector<string>& fleets, const vector<string>& teams, const vector<string>& positions) const {
	return isAllValid(bases, this->validBasesList) && isAllValid(ranks, this->validRanksList)
		&& isAllValid(fleets, this->validFleetsList) && isAllValid(teams, this->validTeamsList)
		&& isAllValid(positions, this->validPositionsList);
}

bool ROSTER::isAllValid(const string& strBases, const string& strRanks, const string& strFleets, const string& strTeams, const string& strPositions) const {
	const vector<string>& bases = splitWithCache(strBases, '|');
	const vector<string>& ranks = splitWithCache(strRanks, '|');
	const vector<string>& fleets = splitWithCache(strFleets, '|');
	const vector<string>& teams = splitWithCache(strTeams, '|');
	const vector<string>& positions = splitWithCache(strPositions, '|');
	return isAllValid(bases, ranks, fleets, teams, positions);
}

bool ROSTER::isValidQual(const vector<string>& quals) const {
	return isAllValid(quals, this->validQualsList);
}

bool ROSTER::isValidQual(const string& strQuals) const {
	const vector<string>& quals = splitWithCache(strQuals, '|');
	return isValidQual(quals);
}

bool ROSTER::isValidTeam(const vector<string>& teams) const {
	return isAllValid(teams, this->validTeamsList);
}

bool ROSTER::isValidTeam(const string& strTeams) const {
	const vector<string>& teams = splitWithCache(strTeams, '|');
	return isValidTeam(teams);
}

void ROSTER::autoConfigDutyValues(const int dutyValueTypes) {
	if (this->pairing == nullptr) {
		return;
    }

	for (size_t dutyIndex = 0; dutyIndex < this->pairing->getDutyVec().size(); dutyIndex++) {
		auto duty = pairing->getDuty(dutyIndex);
        if (dutyValueTypes == 0 || (dutyValueTypes & RosterDutyValues::MAX_FDP) != 0) {
			this->dutyValues.setMaxFdp(dutyIndex, duty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP));
		}

		if (dutyValueTypes == 0 || (dutyValueTypes & RosterDutyValues::MAX_DP) != 0) {
			this->dutyValues.setMaxDp(dutyIndex, duty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_DP));
		}

		if (dutyValueTypes == 0 || (dutyValueTypes & RosterDutyValues::MIN_REST) != 0) {
			this->dutyValues.setMinRest(dutyIndex, duty->getLimitationValue(RULE_LIMITATION_TYPE::MIN_REST));
		}

		if (dutyValueTypes == 0 || (dutyValueTypes & RosterDutyValues::ACC_STATE) != 0) {
			this->dutyValues.setAccState(dutyIndex, duty->getAcclimatisedState());
		}

		if (dutyValueTypes == 0 || (dutyValueTypes & RosterDutyValues::ACC_STATE_FOR_REST_START) != 0) {
			this->dutyValues.setAccStateForRestStart(dutyIndex, duty->getAcclimatisedStateForRestStart());
		}

		if (dutyValueTypes == 0 || (dutyValueTypes & RosterDutyValues::ETRTZ) != 0) {
			this->dutyValues.setETRTZ(dutyIndex, duty->getETRTZ());
		}

		if (dutyValueTypes == 0 || (dutyValueTypes & RosterDutyValues::REF_TIME_ZONE) != 0) {
			this->dutyValues.setRefTimeZone(dutyIndex, duty->getRefTimeZone());
		}

		if (dutyValueTypes == 0 || (dutyValueTypes & RosterDutyValues::TZ_DIFFS) != 0) {
			this->dutyValues.setTzDiffs(dutyIndex, duty->getTzDiffs());
		}
	}

}


limitaions* ROSTER::getLimiation(RULE_LIMITATION_TYPE type) const
{
	limitaions* result = 0;
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		result = getLimiation(_rule_limits_instance, type);
	}
	else {
		result = getLimiation(_rule_limits.get(), type);
	}
	return result;
}

limitaions* ROSTER::getLimiation(const std::vector<std::shared_ptr<limitaions>>& ruleLimits, RULE_LIMITATION_TYPE type) const {
	for (const auto& limit : ruleLimits)
	{
		if (limit->type == type)
			return limit.get();
	}
	return NULL;
}

int ROSTER::getLimitationValue(RULE_LIMITATION_TYPE type) const {
	int result = 0;
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		result = getLimitationValue(_rule_limits_instance, type);
	}
	else {
		result = getLimitationValue(_rule_limits.get(), type);
	}
	return result;
}

int ROSTER::getLimitationValue(const std::vector<std::shared_ptr<limitaions>>& ruleLimits, RULE_LIMITATION_TYPE type) const
{
	for (const auto& limit : ruleLimits)
	{
		if (limit->type == type)
			return limit->value;
	}
	return -1;
}

inline static long long getRuleFunctionId(const long long ruleId) {
	return (ruleId / 1000) * 1000;
}

bool ROSTER::setLimitationValue(std::vector<std::shared_ptr<limitaions>>& ruleLimits, RULE_LIMITATION_TYPE type, int value, long long rule_id, long long ruleParamId, string overrideAbility, string classType, string description, string reference, const bool force, const bool locked, const bool isFinalChecked)
{
	bool success = false;
	bool find = false;
	for (const auto& limit : ruleLimits)
	{
		if (limit->type == type)
		{
			if (limit->locked) {
				long long lastRuleFuncId = getRuleFunctionId(limit->last_set_rule);
				long long currRuleFuncId = getRuleFunctionId(rule_id);
				if (lastRuleFuncId != currRuleFuncId) {
					//被锁定，则其他法规不能，但当前法规能修改
					return false;
				}
			}
			if (type == RULE_LIMITATION_TYPE::MIN_REST)
			{

				if (limit->value <= value || force)
				{
					limit->value = force ? value : max(limit->value, value);
					limit->last_set_rule = rule_id;
					limit->ruleParamId = ruleParamId;
					limit->isFinalChecked = isFinalChecked;
					limit->locked = locked;
					limit->overrideAbility = limit->overrideAbility == "H" ? limit->overrideAbility : overrideAbility;//若多次设置，记录最高严重等级
					limit->classType = classType;
					limit->description = description;
					limit->reference = reference;
					success = true;
				}
			}
			else
			{
				if (limit->value >= value || force)
				{
					limit->value = force ? value : min(limit->value, value);
					limit->last_set_rule = rule_id;
					limit->ruleParamId = ruleParamId;
					limit->isFinalChecked = isFinalChecked;
					limit->locked = locked;
					limit->overrideAbility = limit->overrideAbility == "H" ? limit->overrideAbility : overrideAbility;//若多次设置，记录最高严重等级
					limit->classType = classType;
					limit->description = description;
					limit->reference = reference;
					success = true;
				}
			}
			find = true;
			return success;
		}
	}

	if (!find)
	{
		auto limit = make_shared<limitaions>();
		limit->last_set_rule = rule_id;
		limit->ruleParamId = ruleParamId;
		limit->isFinalChecked = isFinalChecked;
		limit->locked = locked;
		limit->overrideAbility = overrideAbility;
		limit->classType = classType;
		limit->type = type;
		limit->value = value;
		limit->description = description;
		limit->reference = reference;
		ruleLimits.push_back(limit);
		success = true;
	}
	return success;
}


void ROSTER::clearLimitation(std::vector<std::shared_ptr<limitaions>>& ruleLimits, RULE_LIMITATION_TYPE type) {
	ruleLimits.erase(std::remove_if(ruleLimits.begin(), ruleLimits.end(),
		[type](const auto& limit) {return limit->type == type; })
		, ruleLimits.end());
}

void ROSTER::clearLimitation(std::vector<std::shared_ptr<limitaions>>& ruleLimits) {
	ruleLimits.clear();
}

bool ROSTER::setLimitationValue(RULE_LIMITATION_TYPE type, int value, long long rule_id, long long ruleParamId, string overrideAbility, string classType, string description, string reference, const bool force, const bool locked, const bool isFinalChecked) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		return setLimitationValue(_rule_limits_instance, type, value, rule_id, ruleParamId, overrideAbility, classType, description, reference, force, locked, isFinalChecked);
	}
	else {
		return setLimitationValue(_rule_limits.get(), type, value, rule_id, ruleParamId, overrideAbility, classType, description, reference, force, locked, isFinalChecked);
	}
	return false;
}

void ROSTER::clearLimitation(RULE_LIMITATION_TYPE type)
{
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		clearLimitation(_rule_limits_instance, type);
	}
	else {
		clearLimitation(_rule_limits.get(), type);
	}

}

void ROSTER::clearLimitation()
{
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		clearLimitation(_rule_limits_instance);
	}
	else {
		clearLimitation(_rule_limits.get());
	}
}

string ROSTER::getClassName() const { return "ROSTER"; }
void ROSTER::copy(ROSTER* obj) {
	//mantis#2314, 正则式从member定义生成copy代码
	needRuleCheck = obj->needRuleCheck;
	idscenario = obj->idscenario;
	idcrew = obj->idcrew;
	pairId = obj->pairId;
	rosterId = obj->rosterId;
	label = obj->label;
	pairingStartDt = obj->pairingStartDt;
	sourceType = obj->sourceType;
	strUtc = obj->strUtc;
	restStrUtc = obj->restStrUtc;
	endUtc = obj->endUtc;
	strLoc = obj->strLoc;
	restStrLoc = obj->restStrLoc;
	endLoc = obj->endLoc;
	duty = obj->duty;
	source = obj->source;
	actingRank = obj->actingRank;
	actStrUtc = obj->actStrUtc;
	actRestStrUtc = obj->actRestStrUtc;
	actEndUtc = obj->actEndUtc;
	actStrLoc = obj->actStrLoc;
	actRestStrLoc = obj->actRestStrLoc;
	actEndLoc = obj->actEndLoc;
	isValid = obj->isValid;
	isDelete = obj->isDelete;
	isNotified = obj->isNotified;
	notifiedUser = obj->notifiedUser;
	notifiedTmst = obj->notifiedTmst;
	location = obj->location;
	isPublished = obj->isPublished;
	publishedUtc = obj->publishedUtc;
	appId = obj->appId;
	calloutUtc = obj->calloutUtc;
	allocCode = obj->allocCode;
	allocTmst = obj->allocTmst;
	comments = obj->comments;
	uniComments = obj->uniComments;
	deallocCode = obj->deallocCode;
	deallocIduser = obj->deallocIduser;
	trgActiveRank = obj->trgActiveRank;
	isSwapped = obj->isSwapped;
	swapIdStaff = obj->swapIdStaff;
	ttotInd = obj->ttotInd;
	totalPayTime = obj->totalPayTime;
	idUser = obj->idUser;
	tmst = obj->tmst;
	pairing = obj->pairing;
	indexInRosterListOfCrew = obj->indexInRosterListOfCrew;
	qualifier = obj->qualifier;
	isRequested = obj->isRequested;
	origin = obj->origin;
	position = obj->position;
	role = obj->role;
	_isLegal = obj->_isLegal;
	_vilation_messages = obj->_vilation_messages;
	isCalculated = obj->isCalculated;
	//20180505 ain, mantis#3277, roster复制补齐字段
	role = obj->role;
	subRole = obj->subRole;
	seqOrder = obj->seqOrder;

	//training 训练
	tmGroupId = obj->tmGroupId;
	tmProgramCourseId = obj->tmProgramCourseId;
	tmResourceCode = obj->tmResourceCode;
	tmRole = obj->tmRole;
	tmParentProgramCourseId = obj->tmParentProgramCourseId;

	//合法base、fleet等
	validBasesList = obj->validBasesList;
	validFleetsList = obj->validFleetsList;
	validRanksList = obj->validRanksList;
	validPositionsList = obj->validPositionsList;
	validQualsList = obj->validQualsList;
	validTeamsList = obj->validTeamsList;

	creditMinutes = obj->creditMinutes;
	fmCreditMinutes = obj->fmCreditMinutes;
	schCreditMinutes = obj->schCreditMinutes;
	schFmCreditMinutes = obj->schFmCreditMinutes;

	perDiemMins = obj->perDiemMins;
	lhPerDiemMins = obj->lhPerDiemMins;
	fmPerDiemMins = obj->fmPerDiemMins;
	fmLhPerDiemMins = obj->fmLhPerDiemMins;
	schPerDiemMins = obj->schPerDiemMins;
	schLhPerDiemMins = obj->schLhPerDiemMins;
	schFmPerDiemMins = obj->schFmPerDiemMins;
	schFmLhPerDiemMins = obj->schFmLhPerDiemMins;

	workingHour = obj->workingHour;
	schWorkingHour = obj->schWorkingHour;

	isCallOut = obj->isCallOut;
	isCallOutRoster = obj->isCallOutRoster;
	callOutRosterId = obj->callOutRosterId;
	notificationRemark = obj->notificationRemark;
	notificationTime = obj->notificationTime;
	preference = obj->preference;
	createdBy = obj->createdBy;
	createdDt = obj->createdDt;
	score = obj->score;

	isAgreeWork = obj->isAgreeWork;
	exceptionCode = obj->exceptionCode;
	exceptionCodes = obj->exceptionCodes;
	
	attribute = obj->attribute;
}


void ROSTER::clear() {
	this->_vilation_messages.clear();
}

bool ROSTER::isAllValid(const vector<string>& checkedList, const set<string>& validList) const {
	if (checkedList.empty()) {
		return true;
	}
	for (auto& checkedObj : checkedList) {
		auto iter = validList.find(checkedObj);
		if (iter != validList.end()) {
			return true;
		}
	}
	return false;
}

//按是否preAssign为条件从input中筛选
vector<SharedPtr<ROSTER>> filterRosterByPreAssign(vector<SharedPtr<ROSTER>> &input, bool isPreAssign) {
	vector<SharedPtr<ROSTER>> list;
	for (std::size_t i = 0; i < input.size(); i++) {
		if (isPreAssign && input[i]->sourceType == ROSTER_SOURCE_PRE_ASSIGN) {
			list.push_back(input[i]);
		}
		else if (!isPreAssign && input[i]->sourceType != ROSTER_SOURCE_PRE_ASSIGN) {
			list.push_back(input[i]);
		}
	}
	return list;
}


//排序回调对比函数：roster.idcrew
//	std::sort(list.begin(), list.end(), compareRosterByIdcrew);
bool compareRosterByIdcrew(SharedPtr<ROSTER> i, SharedPtr<ROSTER> j) {
	if (0 < (i->idcrew.compare(j->idcrew)))                                 //first layer: idcrew
		return false;
	else if (0 == (i->idcrew.compare(j->idcrew)) && i->strUtc <= j->strUtc) //second layer: strUtc, strict weak ordering
		return false;
	else
		return true;
}

//排序回调对比函数：roster.actStrUtc
bool compareRosterByStartDT(SharedPtr<ROSTER> i, SharedPtr<ROSTER> j)  {
	//return (i->actStrUtc < j->actStrUtc);
	if (i->actStrUtc < j->actStrUtc)
		return true;
	else if (i->actStrUtc > j->actStrUtc)
		return false;
	else
		return (i->actRestStrUtc < j->actRestStrUtc);
}


void sortRosterByStrUtc(vector<SharedPtr<ROSTER>>& list) {
	sort(list.begin(), list.end(), [](SharedPtr<ROSTER>& a, SharedPtr<ROSTER>& b)
	{
		return a->strUtc < b->strUtc;
	});
}

//排序回调对比函数：roster.pairId
bool   compareRosterByPairId(SharedPtr<ROSTER> i, SharedPtr<ROSTER> j) {
	return (i->pairId < j->pairId);
}

//
