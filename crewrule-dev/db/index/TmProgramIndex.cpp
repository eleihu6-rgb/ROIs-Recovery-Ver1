#include <stdio.h>
#include <vector>
#include <algorithm>

#include <limits.h>

#include <iostream>
#include <time.h>
#include "UtilFunc.h"
#include "Utility.h"
#include "TimezoneUtils.h"
#include "TmProgramIndex.h"
#include "Log/Logger.h"

//TmProgramIndex
TmProgramIndex::TmProgramIndex(const vector<std::shared_ptr<TmProgram>>& tmProgramList) {
	makeIndex(tmProgramList);
}

const std::shared_ptr<TmProgram> TmProgramIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmProgram>> TmProgramIndex::getByCrewId(const string& crewId) const {
	vector<std::shared_ptr<TmProgram>> list;
	auto pos = _crewIdIndex.equal_range(crewId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmProgramIndex::makeIndex(const vector<std::shared_ptr<TmProgram>>& tmProgramList) {
	_idIndex.clear();
	_crewIdIndex.clear();
	for (auto& tmProgram : tmProgramList) {
		if (tmProgram->id !=0)
			_idIndex.insert(std::make_pair(tmProgram->id, tmProgram));

		if (!tmProgram->crewId.empty())
			_crewIdIndex.insert(std::make_pair(tmProgram->crewId, tmProgram));
	}
}

//TmProgramBuddyIndex
TmProgramBuddyIndex::TmProgramBuddyIndex(const vector<std::shared_ptr<TmProgramBuddy>>& tmProgramBuddyList) {
	makeIndex(tmProgramBuddyList);
}

const std::shared_ptr<TmProgramBuddy> TmProgramBuddyIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmProgramBuddy>> TmProgramBuddyIndex::getByCrewId(const string& crewId) const {
	vector<std::shared_ptr<TmProgramBuddy>> list;
	auto pos = _crewIdIndex.equal_range(crewId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramBuddy>> TmProgramBuddyIndex::getByBuddyId(const string& buddyId) const {
	vector<std::shared_ptr<TmProgramBuddy>> list;
	auto pos = _buddyIdIndex.equal_range(buddyId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmProgramBuddyIndex::makeIndex(const vector<std::shared_ptr<TmProgramBuddy>>& tmProgramBuddyList) {
	_idIndex.clear();
	_crewIdIndex.clear();
	_buddyIdIndex.clear();
	for (auto& tmProgramBuddy : tmProgramBuddyList) {
		if (tmProgramBuddy->id != 0)
			_idIndex.insert(std::make_pair(tmProgramBuddy->id, tmProgramBuddy));

		if (!tmProgramBuddy->crewId.empty())
			_crewIdIndex.insert(std::make_pair(tmProgramBuddy->crewId, tmProgramBuddy));

		if (!tmProgramBuddy->buddyId.empty())
			_buddyIdIndex.insert(std::make_pair(tmProgramBuddy->buddyId, tmProgramBuddy));
	}
}

//TmProgramBuddyTimeIndex
TmProgramBuddyTimeIndex::TmProgramBuddyTimeIndex(const vector<std::shared_ptr<TmProgramBuddyTime>>& tmProgramBuddyTimeList) {
	makeIndex(tmProgramBuddyTimeList);
}

const std::shared_ptr<TmProgramBuddyTime> TmProgramBuddyTimeIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmProgramBuddyTime>> TmProgramBuddyTimeIndex::getByProgramBuddyId(const long long programBuddyId) const {
	vector<std::shared_ptr<TmProgramBuddyTime>> list;
	auto pos = _programBuddyIdIndex.equal_range(programBuddyId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmProgramBuddyTimeIndex::makeIndex(const vector<std::shared_ptr<TmProgramBuddyTime>>& tmProgramBuddyTimeList) {
	_idIndex.clear();
	_programBuddyIdIndex.clear();
	for (auto& tmProgramBuddyTime : tmProgramBuddyTimeList) {
		if (tmProgramBuddyTime->id != 0)
			_idIndex.insert(std::make_pair(tmProgramBuddyTime->id, tmProgramBuddyTime));

		if (tmProgramBuddyTime->tmProgramBuddyId != 0)
			_programBuddyIdIndex.insert(std::make_pair(tmProgramBuddyTime->tmProgramBuddyId, tmProgramBuddyTime));
	}
}


TmProgramBuddyCourseIndex::TmProgramBuddyCourseIndex(const vector<std::shared_ptr<TmProgramBuddyCourse>>& tmProgramBuddyCourseList) {
	makeIndex(tmProgramBuddyCourseList);
}

const std::shared_ptr<TmProgramBuddyCourse> TmProgramBuddyCourseIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmProgramBuddyCourse>> TmProgramBuddyCourseIndex::getByProgramId(const long long programId) const {
	vector<std::shared_ptr<TmProgramBuddyCourse>> list;
	auto pos = _programIdIndex.equal_range(programId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramBuddyCourse>> TmProgramBuddyCourseIndex::getByProgramBuddyId(const long long programBuddyId) const {
	vector<std::shared_ptr<TmProgramBuddyCourse>> list;
	auto pos = _programBuddyIdIndex.equal_range(programBuddyId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramBuddyCourse>> TmProgramBuddyCourseIndex::getByProgramBuddyTimeId(const long long programBuddyTimeId) const {
	vector<std::shared_ptr<TmProgramBuddyCourse>> list;
	auto pos = _programBuddyTimeIdIndex.equal_range(programBuddyTimeId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramBuddyCourse>> TmProgramBuddyCourseIndex::getByProgramAndCourse(const long long programId, const long long courseId) const {
	string key = makeKey(programId, courseId);

	vector<std::shared_ptr<TmProgramBuddyCourse>> list;
	auto pos = _programIdAndCourseIdIndex.equal_range(key);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const int TmProgramBuddyCourseIndex::getBuddyNumber(const long long programId, const long long courseId) const {
	auto list = getByProgramAndCourse(programId, courseId);
	return list.size();
}

string TmProgramBuddyCourseIndex::makeKey(const long long programId, const long long courseId) const {
	stringstream ss;
	ss << programId << "$";
	ss << courseId << "$";
	return ss.str();
}

void TmProgramBuddyCourseIndex::makeIndex(const vector<std::shared_ptr<TmProgramBuddyCourse>>& tmProgramBuddyCourseList) {
	_idIndex.clear();
	_programBuddyIdIndex.clear();
	_programIdIndex.clear();
	_programBuddyTimeIdIndex.clear();
	_programIdAndCourseIdIndex.clear();
	for (auto& tmProgramBuddyCourse : tmProgramBuddyCourseList) {
		if (tmProgramBuddyCourse->id != 0)
			_idIndex.insert(std::make_pair(tmProgramBuddyCourse->id, tmProgramBuddyCourse));

		if (tmProgramBuddyCourse->programBuddyId != 0)
			_programBuddyIdIndex.insert(std::make_pair(tmProgramBuddyCourse->programBuddyId, tmProgramBuddyCourse));

		if (tmProgramBuddyCourse->programId != 0)
			_programIdIndex.insert(std::make_pair(tmProgramBuddyCourse->programId, tmProgramBuddyCourse));

		if (tmProgramBuddyCourse->programBuddyTimeId != 0)
			_programBuddyTimeIdIndex.insert(std::make_pair(tmProgramBuddyCourse->programBuddyTimeId, tmProgramBuddyCourse));

		if (tmProgramBuddyCourse->programId != 0) {
			string key = makeKey(tmProgramBuddyCourse->programId, tmProgramBuddyCourse->courseId);
			_programIdAndCourseIdIndex.insert(std::make_pair(key, tmProgramBuddyCourse));

		}

	}
}

//TmProgramPipIndex
TmProgramPipIndex::TmProgramPipIndex(const vector<std::shared_ptr<TmProgramPip>>& tmProgramPipList) {
	makeIndex(tmProgramPipList);
}

const std::shared_ptr<TmProgramPip> TmProgramPipIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmProgramPip>> TmProgramPipIndex::getByProgramId(const long long programId, const string& simioe, const string& phase) const {
	vector<std::shared_ptr<TmProgramPip>> list;
	string key;
	if (simioe == "IOE") {
		key = makeKey(programId, simioe, "");
	}
	else {
		key = makeKey(programId, simioe, phase);
	}

	auto pos = _programIdAndSimioeAndPhaseIndex.equal_range(key);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmProgramPipIndex::makeIndex(const vector<std::shared_ptr<TmProgramPip>>& tmProgramPipList) {
	_idIndex.clear();
	_programIdAndSimioeAndPhaseIndex.clear();
	for (auto& tmProgramPip : tmProgramPipList) {
		if (tmProgramPip->id != 0)
			_idIndex.insert(std::make_pair(tmProgramPip->id, tmProgramPip));

		if (tmProgramPip->programId != 0) {
			if (tmProgramPip->phase.empty()) {
				string key = makeKey(tmProgramPip->programId, tmProgramPip->simioe, "");
				_programIdAndSimioeAndPhaseIndex.insert(std::make_pair(key, tmProgramPip));
			}
			else {
				for (auto& phase : tmProgramPip->phase) {
					string key = makeKey(tmProgramPip->programId, tmProgramPip->simioe, phase);
					_programIdAndSimioeAndPhaseIndex.insert(std::make_pair(key, tmProgramPip));
				}
			}
		}
	}
}

string TmProgramPipIndex::makeKey(const long long programId, const string& simioe, const string& phase) const {
	stringstream ss;
	ss << programId << "$";
	ss << simioe << "$";
	ss << phase;
	return ss.str();
}

//TmProgramCourseIndex
TmProgramCourseIndex::TmProgramCourseIndex(const unordered_map<long long, std::shared_ptr<TmProgramCourse>>& tmProgramCourseMap) {
	makeIndex(tmProgramCourseMap);
}

const std::shared_ptr<TmProgramCourse> TmProgramCourseIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmProgramCourse>> TmProgramCourseIndex::getByCrewId(const string& crewId) const {
	vector<std::shared_ptr<TmProgramCourse>> list;
	auto pos = _crewIdIndex.equal_range(crewId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourse>> TmProgramCourseIndex::getByRosterId(const long long rosterId) const {
	vector<std::shared_ptr<TmProgramCourse>> list;
	auto pos = _rosterIdIndex.equal_range(rosterId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	sortByStartTime(list);
	return list;
}

const std::shared_ptr<TmProgramCourse> TmProgramCourseIndex::getByRosterId(const long long rosterId, const long long flightId) const {
	string key = makeRosterAndFltKey(rosterId, flightId);
	auto iter = _rosterAndFltIndex.find(key);
	if (iter == _rosterAndFltIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const std::shared_ptr<TmProgramCourse> TmProgramCourseIndex::getByRosterId(const long long rosterId, const string& groupId) const {
	auto pos = _rosterIdIndex.equal_range(rosterId);
	while (pos.first != pos.second)
	{
		auto& tmProgramCourse = pos.first->second;
		if (tmProgramCourse->groupId == groupId) {
			return tmProgramCourse;
		}
		++pos.first;
	}
	return nullptr;
}

const vector<std::shared_ptr<TmProgramCourse>> TmProgramCourseIndex::getByGroupId(const string& groupId) const {
	vector<std::shared_ptr<TmProgramCourse>> list;
	auto pos = _groupIdIndex.equal_range(groupId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const std::shared_ptr<TmProgramCourse> TmProgramCourseIndex::getAnyOneByGroupId(const string& groupId) const {
	std::shared_ptr<TmProgramCourse> anyOne = nullptr;
	auto pos = _groupIdIndex.equal_range(groupId);
	if (pos.first != pos.second)
	{
		anyOne = pos.first->second;
	}
	return anyOne;
}

const vector<std::shared_ptr<TmProgramCourse>> TmProgramCourseIndex::getByProgramId(const long long programId) const {
	vector<std::shared_ptr<TmProgramCourse>> list;
	auto pos = _programIdIndex.equal_range(programId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const long long TmProgramCourseIndex::getProgramIdByGroupId(const string& groupId) const {
	long long programId = 0;
	vector<std::shared_ptr<TmProgramCourse>> list;
	auto pos = _groupIdIndex.equal_range(groupId);
	if (pos.first != pos.second)
	{
		programId = pos.first->second->programId;
	}
	return programId;
}

const vector<std::shared_ptr<TmProgramCourse>> TmProgramCourseIndex::getByFlightId(const long long flightId) const {
	vector<std::shared_ptr<TmProgramCourse>> list;
	auto pos = _flightIdIndex.equal_range(flightId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourse>> TmProgramCourseIndex::getByFlightId(const long long programId, const long long flightId) const {
	string key = makeProgramAndFltKey(programId, flightId);
	vector<std::shared_ptr<TmProgramCourse>> list;
	auto pos = _programAndFltIndex.equal_range(key);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourse>> TmProgramCourseIndex::getByDeviceTimeId(const long long deviceTimeId) const {
	vector<std::shared_ptr<TmProgramCourse>> list;
	return list;
}

const vector<std::shared_ptr<TmProgramCourse>> TmProgramCourseIndex::getChildrenByParentId(const long long parentId) const {
	vector<std::shared_ptr<TmProgramCourse>> list;
	auto pos = _parentIdIndex.equal_range(parentId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<long long> TmProgramCourseIndex::getIdsByGroupId(const string& groupId) const {
	vector<long long> list;
	auto tmProgramCourseList = getByGroupId(groupId);
	for (auto& tmProgramCourse : tmProgramCourseList) {
		list.emplace_back(tmProgramCourse->id);
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourse>> TmProgramCourseIndex::getSameProgramCourses(const std::shared_ptr<TmProgramCourse>& tmProgramCourse) const {
	vector<std::shared_ptr<TmProgramCourse>> list;
	long long parentId = tmProgramCourse->parentId; //默认时，假设当前是子课程
	if (parentId == 0) {
		//当前父课程
		list.emplace_back(tmProgramCourse);//第一个加入父课程

		parentId = tmProgramCourse->id;
	}
	else {//当前子课程
		//获得父课程
		auto iter = _idIndex.find(tmProgramCourse->parentId);
		if (iter != _idIndex.end()) {
			list.emplace_back(iter->second);//第一个加入父课程
		}
		else {
			Logger::getRuleLogger()->error("Program Course does not hava parent program course.programCourseId:{}, parentId:{}", tmProgramCourse->id, tmProgramCourse->parentId);
		}
	}
	auto children = getChildrenByParentId(parentId);
	list.insert(list.end(), children.begin(), children.end());
	return list;
}

const vector<std::shared_ptr<TmProgramCourse>> TmProgramCourseIndex::getByDevice(const string& resourceCode, const time_t startTimeUtc, const time_t endTimeUtc) const {
	string key = makeDeviceKey(resourceCode, startTimeUtc, endTimeUtc);
	vector<std::shared_ptr<TmProgramCourse>> list;
	auto pos = _deviceTimeUtcIndex.equal_range(key);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const std::shared_ptr<TmProgramCourse> TmProgramCourseIndex::getRootByProgramId(const long long programId, const string& courseSeq) const {
	string key = makeRootKey(programId, courseSeq);
	auto iter = _rootIndex.find(key);
	if (iter == _rootIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmProgramCourse>> TmProgramCourseIndex::getByCourseId(const long long courseId) const {
	vector<std::shared_ptr<TmProgramCourse>> list;
	auto pos = _courseIdIndex.equal_range(courseId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourse>> TmProgramCourseIndex::getByCourseIds(const std::set<long long>& courseIds) const {
	vector<std::shared_ptr<TmProgramCourse>> list;
	for (auto courseId : courseIds) {
		auto _list = getByCourseId(courseId);
		list.insert(list.end(), _list.begin(), _list.end());
	}
	return list;
}

void TmProgramCourseIndex::sortByStartTime(vector<std::shared_ptr<TmProgramCourse>>& programCourseList) const{
	std::sort(programCourseList.begin(), programCourseList.end(), [](const std::shared_ptr<TmProgramCourse>& a, const std::shared_ptr<TmProgramCourse>& b) {
			return a->startTime < b->startTime;
		});
}

void TmProgramCourseIndex::createIndex(const std::shared_ptr<TmProgramCourse>& tmProgramCourse) {
	if (tmProgramCourse->id != 0)
		_idIndex.insert(std::make_pair(tmProgramCourse->id, tmProgramCourse));

	if (!tmProgramCourse->crewId.empty())
		_crewIdIndex.insert(std::make_pair(tmProgramCourse->crewId, tmProgramCourse));

	if (tmProgramCourse->rosterId != 0)
		_rosterIdIndex.insert(std::make_pair(tmProgramCourse->rosterId, tmProgramCourse));

	if (tmProgramCourse->rosterGroundId != 0)
		_rosterIdIndex.insert(std::make_pair(tmProgramCourse->rosterGroundId, tmProgramCourse));

	if (!tmProgramCourse->groupId.empty())
		_groupIdIndex.insert(std::make_pair(tmProgramCourse->groupId, tmProgramCourse));

	if (tmProgramCourse->programId != 0)
		_programIdIndex.insert(std::make_pair(tmProgramCourse->programId, tmProgramCourse));

	if (tmProgramCourse->fltId != 0)
		_flightIdIndex.insert(std::make_pair(tmProgramCourse->fltId, tmProgramCourse));

	if (tmProgramCourse->parentId != 0)
		_parentIdIndex.insert(std::make_pair(tmProgramCourse->parentId, tmProgramCourse));

	if (!tmProgramCourse->resourceCode.empty()) {
		string key = makeDeviceKey(tmProgramCourse->resourceCode, tmProgramCourse->startTime, tmProgramCourse->endTime);
		_deviceTimeUtcIndex.insert(std::make_pair(key, tmProgramCourse));
	}

	if (tmProgramCourse->parentId == 0) {
		string key = makeRootKey(tmProgramCourse->programId, tmProgramCourse->courseSeq);
		_rootIndex.insert(std::make_pair(key, tmProgramCourse));
	}

	if (tmProgramCourse->rosterId != 0 && tmProgramCourse->fltId != 0) {
		string key = makeRosterAndFltKey(tmProgramCourse->rosterId, tmProgramCourse->fltId);
		_rosterAndFltIndex.insert(std::make_pair(key, tmProgramCourse));
	}

	if (tmProgramCourse->programId != 0 && tmProgramCourse->fltId != 0) {
		string key = makeProgramAndFltKey(tmProgramCourse->programId, tmProgramCourse->fltId);
		_programAndFltIndex.insert(std::make_pair(key, tmProgramCourse));
	}

	if (tmProgramCourse->id != 0 && tmProgramCourse->courseId != 0) {
		_courseIdIndex.insert(std::make_pair(tmProgramCourse->courseId, tmProgramCourse));
	}
}

void TmProgramCourseIndex::removeIndex(const std::shared_ptr<TmProgramCourse>& tmProgramCourse) {
	if (tmProgramCourse->id != 0)
		_idIndex.erase(tmProgramCourse->id);

	if (!tmProgramCourse->crewId.empty()) {
		auto range = _crewIdIndex.equal_range(tmProgramCourse->crewId);
		_crewIdIndex.erase(range.first, range.second);
	}

	if (tmProgramCourse->rosterId != 0) {
		auto range = _rosterIdIndex.equal_range(tmProgramCourse->rosterId);
		_rosterIdIndex.erase(range.first, range.second);
	}

	if (tmProgramCourse->rosterGroundId != 0) {
		auto range = _rosterIdIndex.equal_range(tmProgramCourse->rosterGroundId);
		_rosterIdIndex.erase(range.first, range.second);
	}

	if (!tmProgramCourse->groupId.empty()) {
		auto range = _groupIdIndex.equal_range(tmProgramCourse->groupId);
		_groupIdIndex.erase(range.first, range.second);
	}

	if (tmProgramCourse->programId != 0) {
		auto range = _programIdIndex.equal_range(tmProgramCourse->programId);
		_programIdIndex.erase(range.first, range.second);
	}

	if (tmProgramCourse->fltId != 0) {
		auto range = _flightIdIndex.equal_range(tmProgramCourse->fltId);
		_flightIdIndex.erase(range.first, range.second);
	}

	if (tmProgramCourse->parentId != 0) {
		auto range = _parentIdIndex.equal_range(tmProgramCourse->parentId);
		_parentIdIndex.erase(range.first, range.second);
	}

	if (!tmProgramCourse->resourceCode.empty()) {
		string key = makeDeviceKey(tmProgramCourse->resourceCode, tmProgramCourse->startTime, tmProgramCourse->endTime);
		auto range = _deviceTimeUtcIndex.equal_range(key);
		_deviceTimeUtcIndex.erase(range.first, range.second);
	}

	if (tmProgramCourse->parentId == 0) {
		string key = makeRootKey(tmProgramCourse->programId, tmProgramCourse->courseSeq);
		_rootIndex.erase(key);
	}

	if (tmProgramCourse->rosterId != 0 && tmProgramCourse->fltId != 0) {
		string key = makeRosterAndFltKey(tmProgramCourse->rosterId, tmProgramCourse->fltId);
		_rosterAndFltIndex.erase(key);
	}

	if (tmProgramCourse->programId != 0 && tmProgramCourse->fltId != 0) {
		string key = makeProgramAndFltKey(tmProgramCourse->programId, tmProgramCourse->fltId);
		_programAndFltIndex.erase(key);
	}

	if (tmProgramCourse->id != 0 && tmProgramCourse->courseId != 0) {
		auto range = _courseIdIndex.equal_range(tmProgramCourse->courseId);
		_courseIdIndex.erase(range.first, range.second);
	}
}

string TmProgramCourseIndex::makeDeviceKey(const string& resourceCode, const time_t startTimeUtc, const time_t endTimeUtc) const {
	stringstream ss;
	ss << resourceCode << "|";
	ss << startTimeUtc << "|";
	ss << endTimeUtc;
	return ss.str();
}

string TmProgramCourseIndex::makeRootKey(const long long programId, const string& courseSeq) const {
	stringstream ss;
	ss << programId << "|";
	ss << courseSeq;
	return ss.str();
}

string TmProgramCourseIndex::makeRosterAndFltKey(const long long rosterId, const long long fltId) const {
	stringstream ss;
	ss << rosterId << "|";
	ss << fltId;
	return ss.str();
}

string TmProgramCourseIndex::makeProgramAndFltKey(const long long programId, const long long fltId) const {
	stringstream ss;
	ss << programId << "|";
	ss << fltId;
	return ss.str();
}

void TmProgramCourseIndex::makeIndex(const unordered_map<long long, std::shared_ptr<TmProgramCourse>>& tmProgramCourseMap) {
	_idIndex.clear();
	_crewIdIndex.clear();
	_rosterIdIndex.clear();
	_groupIdIndex.clear();
	_programIdIndex.clear();
	_flightIdIndex.clear();
	_parentIdIndex.clear();
	_deviceTimeUtcIndex.clear();
	_rootIndex.clear();
	_rosterAndFltIndex.clear();
	_programAndFltIndex.clear();
	_courseIdIndex.clear();
	for (auto& pair : tmProgramCourseMap) {
		auto& tmProgramCourse = pair.second;
		createIndex(tmProgramCourse);
	}
}

//TmProgramCourseInstructorIndex
TmProgramCourseInstructorIndex::TmProgramCourseInstructorIndex(const unordered_map<long long, std::shared_ptr<TmProgramCourseInstructor>>& tmProgramCourseInstructorMap) {
	makeIndex(tmProgramCourseInstructorMap);
}

const std::shared_ptr<TmProgramCourseInstructor> TmProgramCourseInstructorIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmProgramCourseInstructor>> TmProgramCourseInstructorIndex::getByCrewId(const string& crewId) const {
	vector<std::shared_ptr<TmProgramCourseInstructor>> list;
	auto pos = _crewIdIndex.equal_range(crewId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}


const std::shared_ptr<TmProgramCourseInstructor> TmProgramCourseInstructorIndex::getByCrewId(const string& crewId, const long long flightId) const {
	string key = makeCrewAndFltKey(crewId, flightId);
	auto iter = _crewIdAndFltIndex.find(key);
	if (iter == _crewIdAndFltIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmProgramCourseInstructor>> TmProgramCourseInstructorIndex::getByRosterId(const long long rosterId) const {
	vector<std::shared_ptr<TmProgramCourseInstructor>> list;
	auto pos = _rosterIdIndex.equal_range(rosterId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const std::shared_ptr<TmProgramCourseInstructor> TmProgramCourseInstructorIndex::getByRosterId(const long long rosterId, const long long flightId) const {
	string key = makeRosterAndFltKey(rosterId, flightId);
	auto iter = _rosterAndFltIndex.find(key);
	if (iter == _rosterAndFltIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const std::shared_ptr<TmProgramCourseInstructor> TmProgramCourseInstructorIndex::getByRosterId(const long long rosterId, const string& groupId) const {
	auto pos = _rosterIdIndex.equal_range(rosterId);
	while (pos.first != pos.second)
	{
		auto& tmProgramCourseInstructor = pos.first->second;
		if (tmProgramCourseInstructor->groupId == groupId) {
			return tmProgramCourseInstructor;
		}
		++pos.first;
	}
	return nullptr;
}

const vector<std::shared_ptr<TmProgramCourseInstructor>> TmProgramCourseInstructorIndex::getByGroupId(const string& groupId) const {
	vector<std::shared_ptr<TmProgramCourseInstructor>> list;
	auto pos = _groupIdIndex.equal_range(groupId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourseInstructor>> TmProgramCourseInstructorIndex::getByGroupIdAndRole(const string& groupId, const string& role) const {
	vector<std::shared_ptr<TmProgramCourseInstructor>> list;
	string key = makeKey(groupId, role);
	auto pos = _groupIdAndRoleIndex.equal_range(key);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourseInstructor>> TmProgramCourseInstructorIndex::getByGroupIdAndRole(const string& groupId, const vector<string>& roles) const {
	if (roles.empty()) {
		return getByGroupId(groupId);
	}
	vector<std::shared_ptr<TmProgramCourseInstructor>> list;
	for (auto& role : roles) {
		string key = makeKey(groupId, role);
		auto pos = _groupIdAndRoleIndex.equal_range(key);
		while (pos.first != pos.second)
		{
			list.emplace_back(pos.first->second);
			++pos.first;
		}
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourseInstructor>> TmProgramCourseInstructorIndex::getByFlightId(const long long flightId) const {
	vector<std::shared_ptr<TmProgramCourseInstructor>> list;
	auto pos = _flightIdIndex.equal_range(flightId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourseInstructor>> TmProgramCourseInstructorIndex::getByDevice(const string& resourceCode, const time_t startTimeUtc, const time_t endTimeUtc) const {
	string key = makeDeviceKey(resourceCode, startTimeUtc, endTimeUtc);
	vector<std::shared_ptr<TmProgramCourseInstructor>> list;
	auto pos = _deviceTimeUtcIndex.equal_range(key);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

//创建索引
void TmProgramCourseInstructorIndex::createIndex(const std::shared_ptr<TmProgramCourseInstructor>& tmProgramCourseInstructor) {
	if (tmProgramCourseInstructor->id != 0)
		_idIndex.insert(std::make_pair(tmProgramCourseInstructor->id, tmProgramCourseInstructor));

	if (!tmProgramCourseInstructor->crewId.empty())
		_crewIdIndex.insert(std::make_pair(tmProgramCourseInstructor->crewId, tmProgramCourseInstructor));

	if (tmProgramCourseInstructor->rosterId != 0)
		_rosterIdIndex.insert(std::make_pair(tmProgramCourseInstructor->rosterId, tmProgramCourseInstructor));

	if (tmProgramCourseInstructor->rosterGroundId != 0)
		_rosterIdIndex.insert(std::make_pair(tmProgramCourseInstructor->rosterGroundId, tmProgramCourseInstructor));

	if (!tmProgramCourseInstructor->groupId.empty())
		_groupIdIndex.insert(std::make_pair(tmProgramCourseInstructor->groupId, tmProgramCourseInstructor));

	if (!tmProgramCourseInstructor->groupId.empty()) {
		string key = makeKey(tmProgramCourseInstructor->groupId, tmProgramCourseInstructor->role);
		_groupIdAndRoleIndex.insert(std::make_pair(key, tmProgramCourseInstructor));
	}

	if (tmProgramCourseInstructor->fltId != 0)
		_flightIdIndex.insert(std::make_pair(tmProgramCourseInstructor->fltId, tmProgramCourseInstructor));

	if (!tmProgramCourseInstructor->resourceCode.empty()) {
		string key = makeDeviceKey(tmProgramCourseInstructor->resourceCode, tmProgramCourseInstructor->startTime, tmProgramCourseInstructor->endTime);
		_deviceTimeUtcIndex.insert(std::make_pair(key, tmProgramCourseInstructor));
	}

	if (tmProgramCourseInstructor->rosterId != 0 && tmProgramCourseInstructor->fltId != 0) {
		string key = makeRosterAndFltKey(tmProgramCourseInstructor->rosterId, tmProgramCourseInstructor->fltId);
		_rosterAndFltIndex.insert(std::make_pair(key, tmProgramCourseInstructor));
	}
}

string TmProgramCourseInstructorIndex::makeDeviceKey(const string& resourceCode, const time_t startTimeUtc, const time_t endTimeUtc) const {
	stringstream ss;
	ss << resourceCode << "|";
	ss << startTimeUtc << "|";
	ss << endTimeUtc;
	return ss.str();
}

string TmProgramCourseInstructorIndex::makeRosterAndFltKey(const long long rosterId, const long long fltId) const {
	stringstream ss;
	ss << rosterId << "|";
	ss << fltId;
	return ss.str();
}

string TmProgramCourseInstructorIndex::makeCrewAndFltKey(const string& crewId, const long long fltId) const {
	stringstream ss;
	ss << crewId << "|";
	ss << fltId;
	return ss.str();
}

//删除索引
void TmProgramCourseInstructorIndex::removeIndex(const std::shared_ptr<TmProgramCourseInstructor>& tmProgramCourseInstructor) {
	if (tmProgramCourseInstructor->id != 0)
		_idIndex.erase(tmProgramCourseInstructor->id);

	if (!tmProgramCourseInstructor->crewId.empty()) {
		auto range = _crewIdIndex.equal_range(tmProgramCourseInstructor->crewId);
		_crewIdIndex.erase(range.first, range.second);
	}

	if (tmProgramCourseInstructor->rosterId != 0) {
		auto range = _rosterIdIndex.equal_range(tmProgramCourseInstructor->rosterId);
		_rosterIdIndex.erase(range.first, range.second);
	}

	if (tmProgramCourseInstructor->rosterGroundId != 0) {
		auto range = _rosterIdIndex.equal_range(tmProgramCourseInstructor->rosterGroundId);
		_rosterIdIndex.erase(range.first, range.second);
	}

	if (!tmProgramCourseInstructor->groupId.empty()) {
		auto range = _groupIdIndex.equal_range(tmProgramCourseInstructor->groupId);
		_groupIdIndex.erase(range.first, range.second);
	}

	if (!tmProgramCourseInstructor->groupId.empty()) {
		string key = makeKey(tmProgramCourseInstructor->groupId, tmProgramCourseInstructor->role);
		auto range = _groupIdAndRoleIndex.equal_range(key);
		_groupIdAndRoleIndex.erase(range.first, range.second);
	}

	if (tmProgramCourseInstructor->fltId != 0) {
		auto range = _flightIdIndex.equal_range(tmProgramCourseInstructor->fltId);
		_flightIdIndex.erase(range.first, range.second);
	}

	if (!tmProgramCourseInstructor->resourceCode.empty()) {
		string key = makeDeviceKey(tmProgramCourseInstructor->resourceCode, tmProgramCourseInstructor->startTime, tmProgramCourseInstructor->endTime);
		auto range = _deviceTimeUtcIndex.equal_range(key);
		_deviceTimeUtcIndex.erase(range.first, range.second);
	}

	if (tmProgramCourseInstructor->rosterId != 0 && tmProgramCourseInstructor->fltId != 0) {
		string key = makeRosterAndFltKey(tmProgramCourseInstructor->rosterId, tmProgramCourseInstructor->fltId);
		_rosterAndFltIndex.erase(key);
	}
}

void TmProgramCourseInstructorIndex::makeIndex(const unordered_map<long long, std::shared_ptr<TmProgramCourseInstructor>>& tmProgramCourseInstructorMap) {
	_idIndex.clear();
	_crewIdIndex.clear();
	_rosterIdIndex.clear();
	_groupIdIndex.clear();
	_groupIdAndRoleIndex.clear();
	_deviceTimeUtcIndex.clear();
	_rosterAndFltIndex.clear();
	for (auto& pair : tmProgramCourseInstructorMap) {
		auto& tmProgramCourseInstructor = pair.second;
		createIndex(tmProgramCourseInstructor);
	}
}

string TmProgramCourseInstructorIndex::makeKey(const string& groupId, const string& role) const {
	return groupId + "$" + role;
}

//TmProgramCourseLimitationIndex
TmProgramCourseLimitationIndex::TmProgramCourseLimitationIndex(const vector<std::shared_ptr<TmProgramCourseLimitation>>& tmProgramCourseLimitationList) {
	makeIndex(tmProgramCourseLimitationList);
}

const std::shared_ptr<TmProgramCourseLimitation> TmProgramCourseLimitationIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmProgramCourseLimitation>> TmProgramCourseLimitationIndex::getByProgramCourseId(const long long tmProgramCourseId) const {
	vector<std::shared_ptr<TmProgramCourseLimitation>> list;
	auto pos = _programCourseIdIndex.equal_range(tmProgramCourseId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourseLimitation>> TmProgramCourseLimitationIndex::getByProgramCoursePnrId(const long long tmProgramCoursePnrId) const {
	vector<std::shared_ptr<TmProgramCourseLimitation>> list;
	auto pos = _programCoursePnrIdIndex.equal_range(tmProgramCoursePnrId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmProgramCourseLimitationIndex::makeIndex(const vector<std::shared_ptr<TmProgramCourseLimitation>>& tmProgramCourseLimitationList) {
	_idIndex.clear();
	_programCourseIdIndex.clear();
	_programCoursePnrIdIndex.clear();
	for (auto& tmProgramCourseLimitation : tmProgramCourseLimitationList) {
		if (tmProgramCourseLimitation->id != 0)
			_idIndex.insert(std::make_pair(tmProgramCourseLimitation->id, tmProgramCourseLimitation));

		if (tmProgramCourseLimitation->programCourseId != 0)
			_programCourseIdIndex.insert(std::make_pair(tmProgramCourseLimitation->programCourseId, tmProgramCourseLimitation));

		if (tmProgramCourseLimitation->programCoursePnrId != 0)
			_programCoursePnrIdIndex.insert(std::make_pair(tmProgramCourseLimitation->programCoursePnrId, tmProgramCourseLimitation));

	}
}

//TmProgramCourseIpRelevanceIndex
TmProgramCourseIpRelevanceIndex::TmProgramCourseIpRelevanceIndex(const vector<std::shared_ptr<TmProgramCourseIpRelevance>>& tmProgramCourseIpRelevanceList) {
	makeIndex(tmProgramCourseIpRelevanceList);
}

const std::shared_ptr<TmProgramCourseIpRelevance> TmProgramCourseIpRelevanceIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmProgramCourseIpRelevance>> TmProgramCourseIpRelevanceIndex::getByProgramCourseId(const long long programCourseId) const {
	vector<std::shared_ptr<TmProgramCourseIpRelevance>> list;
	auto pos = _programCourseIdIndex.equal_range(programCourseId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourseIpRelevance>> TmProgramCourseIpRelevanceIndex::getByProgramCourseInstructorId(const long long programCourseInstructorId) const {
	vector<std::shared_ptr<TmProgramCourseIpRelevance>> list;
	auto pos = _programCourseInstructorIdIndex.equal_range(programCourseInstructorId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmProgramCourseIpRelevanceIndex::makeIndex(const vector<std::shared_ptr<TmProgramCourseIpRelevance>>& tmProgramCourseIpRelevanceList) {
	_idIndex.clear();
	_programCourseIdIndex.clear();
	_programCourseInstructorIdIndex.clear();
	for (auto& tmProgramCourseIpRelevance : tmProgramCourseIpRelevanceList) {
		if (tmProgramCourseIpRelevance->id != 0)
			_idIndex.insert(std::make_pair(tmProgramCourseIpRelevance->id, tmProgramCourseIpRelevance));

		if (tmProgramCourseIpRelevance->programCourseId != 0)
			_programCourseIdIndex.insert(std::make_pair(tmProgramCourseIpRelevance->programCourseId, tmProgramCourseIpRelevance));

		if (tmProgramCourseIpRelevance->programCourseInstructorId != 0)
			_programCourseInstructorIdIndex.insert(std::make_pair(tmProgramCourseIpRelevance->programCourseInstructorId, tmProgramCourseIpRelevance));
	}
}


//TmProgramCourseRoleIndex
TmProgramCourseRoleIndex::TmProgramCourseRoleIndex(const vector<std::shared_ptr<TmProgramCourseRole>>& tmProgramCourseRoleList) {
	makeIndex(tmProgramCourseRoleList);
}

const std::shared_ptr<TmProgramCourseRole> TmProgramCourseRoleIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const map<string, vector<std::shared_ptr<TmProgramCourseRole>>> TmProgramCourseRoleIndex::getByProgramCourseId(const long long tmProgramCourseId, const string& roleType) const {
	map<string, vector<std::shared_ptr<TmProgramCourseRole>>> resultsMap;

	vector<std::shared_ptr<TmProgramCourseRole>> list;
	auto pos = _programCourseIdIndex.equal_range(tmProgramCourseId);
	while (pos.first != pos.second)
	{
		auto& tmProgramCourseRole = pos.first->second;
		if (tmProgramCourseRole->roleType != roleType) {
			++pos.first;
			continue;
		}
		string role = tmProgramCourseRole->role.empty() ? roleType : tmProgramCourseRole->role;
		auto iter = resultsMap.find(role);
		if (iter == resultsMap.end()) {
			vector<std::shared_ptr<TmProgramCourseRole>> list;
			list.emplace_back(tmProgramCourseRole);
			resultsMap.insert(std::make_pair(role, list));
		}
		else {
			iter->second.emplace_back(tmProgramCourseRole);
		}

		++pos.first;
	}
	return resultsMap;
}

const map<string, vector<std::shared_ptr<TmProgramCourseRole>>> TmProgramCourseRoleIndex::getByProgramCourseIds(const vector<long long> tmProgramCourseIds, const string& roleType) const {
	map<string, vector<std::shared_ptr<TmProgramCourseRole>>> resultsMap;
	set<long long> ids;

	for (auto& tmProgramCourseId : tmProgramCourseIds) {
		auto pos = _programCourseIdIndex.equal_range(tmProgramCourseId);
		while (pos.first != pos.second)
		{
			if (ids.find(pos.first->second->id) == ids.end())  {
				auto& tmProgramCourseRole = pos.first->second;
				if (tmProgramCourseRole->roleType != roleType) {
					++pos.first;
					continue;
				}
				//避免重复插入
				ids.emplace(tmProgramCourseRole->id);
				string role = tmProgramCourseRole->role.empty() ? roleType : tmProgramCourseRole->role;
				auto iter = resultsMap.find(role);
				if (iter == resultsMap.end()) {
					vector<std::shared_ptr<TmProgramCourseRole>> list;
					list.emplace_back(tmProgramCourseRole);
					resultsMap.insert(std::make_pair(role, list));
				}
				else {
					iter->second.emplace_back(tmProgramCourseRole);
				}
			}
			++pos.first;
		}
	}
	return resultsMap;
}

const vector<std::shared_ptr<TmProgramCourseRole>> TmProgramCourseRoleIndex::getByProgramCoursePnrId(const long long tmProgramCoursePnrId) const {
	vector<std::shared_ptr<TmProgramCourseRole>> list;
	auto pos = _programCoursePnrIdIndex.equal_range(tmProgramCoursePnrId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmProgramCourseRoleIndex::makeIndex(const vector<std::shared_ptr<TmProgramCourseRole>>& tmProgramCourseRoleList) {
	_idIndex.clear();
	_programCourseIdIndex.clear();
	_programCoursePnrIdIndex.clear();
	for (auto& tmProgramCourseRole : tmProgramCourseRoleList) {
		if (tmProgramCourseRole->id != 0)
			_idIndex.insert(std::make_pair(tmProgramCourseRole->id, tmProgramCourseRole));

		if (tmProgramCourseRole->programCourseId != 0)
			_programCourseIdIndex.insert(std::make_pair(tmProgramCourseRole->programCourseId, tmProgramCourseRole));

		if (tmProgramCourseRole->programCoursePnrId != 0)
			_programCoursePnrIdIndex.insert(std::make_pair(tmProgramCourseRole->programCoursePnrId, tmProgramCourseRole));
	}
}

//TmProgramCourseRoleQualIndex
TmProgramCourseRoleQualIndex::TmProgramCourseRoleQualIndex(const vector<std::shared_ptr<TmProgramCourseRoleQual>>& tmProgramCourseRoleQualList) {
	makeIndex(tmProgramCourseRoleQualList);
}

const std::shared_ptr<TmProgramCourseRoleQual> TmProgramCourseRoleQualIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmProgramCourseRoleQual>> TmProgramCourseRoleQualIndex::getByProgramCourseId(const long long tmProgramCourseId) const {
	vector<std::shared_ptr<TmProgramCourseRoleQual>> list;
	auto pos = _programCourseIdIndex.equal_range(tmProgramCourseId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourseRoleQual>> TmProgramCourseRoleQualIndex::getByProgramCoursePnrId(const long long tmProgramCoursePnrId) const {
	vector<std::shared_ptr<TmProgramCourseRoleQual>> list;
	auto pos = _programCoursePnrIdIndex.equal_range(tmProgramCoursePnrId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourseRoleQual>> TmProgramCourseRoleQualIndex::getByProgramCourseRoleId(const long long programCourseRoleId) const {
	vector<std::shared_ptr<TmProgramCourseRoleQual>> list;
	auto pos = _programCourseRoleIdIndex.equal_range(programCourseRoleId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmProgramCourseRoleQualIndex::makeIndex(const vector<std::shared_ptr<TmProgramCourseRoleQual>>& tmProgramCourseRoleQualList) {
	_idIndex.clear();
	_programCourseIdIndex.clear();
	_programCoursePnrIdIndex.clear();
	_programCourseRoleIdIndex.clear();
	for (auto& tmProgramCourseRoleQual : tmProgramCourseRoleQualList) {
		if (tmProgramCourseRoleQual->id != 0)
			_idIndex.insert(std::make_pair(tmProgramCourseRoleQual->id, tmProgramCourseRoleQual));

		if (tmProgramCourseRoleQual->programCourseId != 0)
			_programCourseIdIndex.insert(std::make_pair(tmProgramCourseRoleQual->programCourseId, tmProgramCourseRoleQual));

		if (tmProgramCourseRoleQual->programCoursePnrId != 0)
			_programCoursePnrIdIndex.insert(std::make_pair(tmProgramCourseRoleQual->programCoursePnrId, tmProgramCourseRoleQual));

		if (tmProgramCourseRoleQual->programCourseRoleId != 0)
			_programCourseRoleIdIndex.insert(std::make_pair(tmProgramCourseRoleQual->programCourseRoleId, tmProgramCourseRoleQual));

	}
}


//TmProgramCourseRoleLimitationIndex
TmProgramCourseRoleLimitationIndex::TmProgramCourseRoleLimitationIndex(const vector<std::shared_ptr<TmProgramCourseRoleLimitation>>& tmProgramCourseRoleLimitationList) {
	makeIndex(tmProgramCourseRoleLimitationList);
}

const std::shared_ptr<TmProgramCourseRoleLimitation> TmProgramCourseRoleLimitationIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmProgramCourseRoleLimitation>> TmProgramCourseRoleLimitationIndex::getByProgramCourseId(const long long tmProgramCourseId) const {
	vector<std::shared_ptr<TmProgramCourseRoleLimitation>> list;
	auto pos = _programCourseIdIndex.equal_range(tmProgramCourseId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourseRoleLimitation>> TmProgramCourseRoleLimitationIndex::getByProgramCoursePnrId(const long long tmProgramCoursePnrId) const {
	vector<std::shared_ptr<TmProgramCourseRoleLimitation>> list;
	auto pos = _programCoursePnrIdIndex.equal_range(tmProgramCoursePnrId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourseRoleLimitation>> TmProgramCourseRoleLimitationIndex::getByProgramCourseRoleId(const long long programCourseRoleId) const {
	vector<std::shared_ptr<TmProgramCourseRoleLimitation>> list;
	auto pos = _programCourseRoleIdIndex.equal_range(programCourseRoleId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmProgramCourseRoleLimitationIndex::makeIndex(const vector<std::shared_ptr<TmProgramCourseRoleLimitation>>& tmProgramCourseRoleLimitationList) {
	_idIndex.clear();
	_programCourseIdIndex.clear();
	_programCoursePnrIdIndex.clear();
	_programCourseRoleIdIndex.clear();
	for (auto& tmProgramCourseRoleLimitation : tmProgramCourseRoleLimitationList) {
		if (tmProgramCourseRoleLimitation->id != 0)
			_idIndex.insert(std::make_pair(tmProgramCourseRoleLimitation->id, tmProgramCourseRoleLimitation));

		if (tmProgramCourseRoleLimitation->programCourseId != 0)
			_programCourseIdIndex.insert(std::make_pair(tmProgramCourseRoleLimitation->programCourseId, tmProgramCourseRoleLimitation));

		if (tmProgramCourseRoleLimitation->programCoursePnrId != 0)
			_programCoursePnrIdIndex.insert(std::make_pair(tmProgramCourseRoleLimitation->programCoursePnrId, tmProgramCourseRoleLimitation));

		if (tmProgramCourseRoleLimitation->programCourseRoleId != 0)
			_programCourseRoleIdIndex.insert(std::make_pair(tmProgramCourseRoleLimitation->programCourseRoleId, tmProgramCourseRoleLimitation));

	}
}

//TmProgramCourseIpRoleIndex
TmProgramCourseIpRoleIndex::TmProgramCourseIpRoleIndex(const vector<std::shared_ptr<TmProgramCourseIpRole>>& tmProgramCourseRoleList) {
	makeIndex(tmProgramCourseRoleList);
}

const std::shared_ptr<TmProgramCourseIpRole> TmProgramCourseIpRoleIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmProgramCourseIpRole>> TmProgramCourseIpRoleIndex::getByProgramCourseId(const long long tmProgramCourseId) const {
	vector<std::shared_ptr<TmProgramCourseIpRole>> list;
	auto pos = _programCourseIdIndex.equal_range(tmProgramCourseId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourseIpRole>> TmProgramCourseIpRoleIndex::getByProgramCourseIds(const vector<long long> tmProgramCourseIds) const {
	vector<std::shared_ptr<TmProgramCourseIpRole>> list;
	set<long long> ids;
	for (auto& tmProgramCourseId : tmProgramCourseIds) {
		auto pos = _programCourseIdIndex.equal_range(tmProgramCourseId);
		while (pos.first != pos.second)
		{
			auto& tmProgramCourseRole = pos.first->second;
			if (ids.find(tmProgramCourseRole->id) == ids.end()) {

				list.emplace_back(tmProgramCourseRole);
				//避免重复插入
				ids.emplace(tmProgramCourseRole->id);
			}
			++pos.first;
		}
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourseIpRole>> TmProgramCourseIpRoleIndex::getByProgramCoursePnrId(const long long tmProgramCoursePnrId) const {
	vector<std::shared_ptr<TmProgramCourseIpRole>> list;
	auto pos = _programCoursePnrIdIndex.equal_range(tmProgramCoursePnrId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmProgramCourseIpRoleIndex::makeIndex(const vector<std::shared_ptr<TmProgramCourseIpRole>>& tmProgramCourseRoleList) {
	_idIndex.clear();
	_programCourseIdIndex.clear();
	_programCoursePnrIdIndex.clear();
	for (auto& tmProgramCourseRole : tmProgramCourseRoleList) {
		if (tmProgramCourseRole->id != 0)
			_idIndex.insert(std::make_pair(tmProgramCourseRole->id, tmProgramCourseRole));

		if (tmProgramCourseRole->programCourseId != 0)
			_programCourseIdIndex.insert(std::make_pair(tmProgramCourseRole->programCourseId, tmProgramCourseRole));

		if (tmProgramCourseRole->programCoursePnrId != 0)
			_programCoursePnrIdIndex.insert(std::make_pair(tmProgramCourseRole->programCoursePnrId, tmProgramCourseRole));
	}
}

//TmProgramCourseIpRoleBaseIndex
TmProgramCourseIpRoleBaseIndex::TmProgramCourseIpRoleBaseIndex(const vector<std::shared_ptr<TmProgramCourseIpRoleBase>>& tmProgramCourseRoleList) {
	makeIndex(tmProgramCourseRoleList);
}

const std::shared_ptr<TmProgramCourseIpRoleBase> TmProgramCourseIpRoleBaseIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmProgramCourseIpRoleBase>> TmProgramCourseIpRoleBaseIndex::getByProgramCourseId(const long long tmProgramCourseId) const {
	vector<std::shared_ptr<TmProgramCourseIpRoleBase>> list;
	auto pos = _programCourseIdIndex.equal_range(tmProgramCourseId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourseIpRoleBase>> TmProgramCourseIpRoleBaseIndex::getByProgramCoursePnrId(const long long tmProgramCoursePnrId) const {
	vector<std::shared_ptr<TmProgramCourseIpRoleBase>> list;
	auto pos = _programCoursePnrIdIndex.equal_range(tmProgramCoursePnrId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourseIpRoleBase>> TmProgramCourseIpRoleBaseIndex::getByProgramCourseIpRoleId(const long long tmProgramCourseIpRoleId) const {
	vector<std::shared_ptr<TmProgramCourseIpRoleBase>> list;
	auto pos = _programCourseIpRoleIdIndex.equal_range(tmProgramCourseIpRoleId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmProgramCourseIpRoleBaseIndex::makeIndex(const vector<std::shared_ptr<TmProgramCourseIpRoleBase>>& tmProgramCourseRoleList) {
	_idIndex.clear();
	_programCourseIdIndex.clear();
	_programCoursePnrIdIndex.clear();
	_programCourseIpRoleIdIndex.clear();
	for (auto& tmProgramCourseRole : tmProgramCourseRoleList) {
		if (tmProgramCourseRole->id != 0)
			_idIndex.insert(std::make_pair(tmProgramCourseRole->id, tmProgramCourseRole));

		if (tmProgramCourseRole->programCourseId != 0)
			_programCourseIdIndex.insert(std::make_pair(tmProgramCourseRole->programCourseId, tmProgramCourseRole));

		if (tmProgramCourseRole->programCoursePnrId != 0)
			_programCoursePnrIdIndex.insert(std::make_pair(tmProgramCourseRole->programCoursePnrId, tmProgramCourseRole));

		if (tmProgramCourseRole->programCourseIpRoleId != 0)
			_programCourseIpRoleIdIndex.insert(std::make_pair(tmProgramCourseRole->programCourseIpRoleId, tmProgramCourseRole));
	}
}

//TmProgramCourseIpRoleQualIndex
TmProgramCourseIpRoleQualIndex::TmProgramCourseIpRoleQualIndex(const vector<std::shared_ptr<TmProgramCourseIpRoleQual>>& tmProgramCourseRoleQualList) {
	makeIndex(tmProgramCourseRoleQualList);
}

const std::shared_ptr<TmProgramCourseIpRoleQual> TmProgramCourseIpRoleQualIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmProgramCourseIpRoleQual>> TmProgramCourseIpRoleQualIndex::getByProgramCourseId(const long long tmProgramCourseId) const {
	vector<std::shared_ptr<TmProgramCourseIpRoleQual>> list;
	auto pos = _programCourseIdIndex.equal_range(tmProgramCourseId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourseIpRoleQual>> TmProgramCourseIpRoleQualIndex::getByProgramCoursePnrId(const long long tmProgramCoursePnrId) const {
	vector<std::shared_ptr<TmProgramCourseIpRoleQual>> list;
	auto pos = _programCoursePnrIdIndex.equal_range(tmProgramCoursePnrId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourseIpRoleQual>> TmProgramCourseIpRoleQualIndex::getByProgramCourseIpRoleId(const long long programCourseIpRoleId) const {
	vector<std::shared_ptr<TmProgramCourseIpRoleQual>> list;
	auto pos = _programCourseIpRoleIdIndex.equal_range(programCourseIpRoleId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourseIpRoleQual>> TmProgramCourseIpRoleQualIndex::getByProgramCourseIpRoleBaseId(const long long programCourseIpRoleBaseId) const {
	vector<std::shared_ptr<TmProgramCourseIpRoleQual>> list;
	auto pos = _programCourseIpRoleBaseIdIndex.equal_range(programCourseIpRoleBaseId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmProgramCourseIpRoleQualIndex::makeIndex(const vector<std::shared_ptr<TmProgramCourseIpRoleQual>>& tmProgramCourseRoleQualList) {
	_idIndex.clear();
	_programCourseIdIndex.clear();
	_programCoursePnrIdIndex.clear();
	_programCourseIpRoleIdIndex.clear();
	_programCourseIpRoleBaseIdIndex.clear();
	for (auto& tmProgramCourseRoleQual : tmProgramCourseRoleQualList) {
		if (tmProgramCourseRoleQual->id != 0)
			_idIndex.insert(std::make_pair(tmProgramCourseRoleQual->id, tmProgramCourseRoleQual));

		if (tmProgramCourseRoleQual->programCourseId != 0)
			_programCourseIdIndex.insert(std::make_pair(tmProgramCourseRoleQual->programCourseId, tmProgramCourseRoleQual));

		if (tmProgramCourseRoleQual->programCoursePnrId != 0)
			_programCoursePnrIdIndex.insert(std::make_pair(tmProgramCourseRoleQual->programCoursePnrId, tmProgramCourseRoleQual));

		if (tmProgramCourseRoleQual->programCourseIpRoleId != 0)
			_programCourseIpRoleIdIndex.insert(std::make_pair(tmProgramCourseRoleQual->programCourseIpRoleId, tmProgramCourseRoleQual));

		if (tmProgramCourseRoleQual->programCourseIpRoleBaseId != 0)
			_programCourseIpRoleBaseIdIndex.insert(std::make_pair(tmProgramCourseRoleQual->programCourseIpRoleBaseId, tmProgramCourseRoleQual));

	}
}

//TmProgramCoursePnrIndex
TmProgramCoursePnrIndex::TmProgramCoursePnrIndex(const vector<std::shared_ptr<TmProgramCoursePnr>>& tmProgramCoursePnrList) {
	makeIndex(tmProgramCoursePnrList);
}

const std::shared_ptr<TmProgramCoursePnr> TmProgramCoursePnrIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const std::shared_ptr<TmProgramCoursePnr> TmProgramCoursePnrIndex::getByProgramCourseId(const long long tmProgramCourseId) const {
	auto iter = _programCourseIdIndex.find(tmProgramCourseId);
	if (iter == _programCourseIdIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmProgramCoursePnr>> TmProgramCoursePnrIndex::getByProgramCourseIds(const vector<long long> tmProgramCourseIds) const {
	set<long long> ids;
	vector<std::shared_ptr<TmProgramCoursePnr>> list;
	for (auto& tmProgramCourseId : tmProgramCourseIds) {
		auto pos = _programCourseIdIndex.equal_range(tmProgramCourseId);
		while (pos.first != pos.second)
		{
			if (ids.find(pos.first->second->id) == ids.end()) {
				//避免重复插入
				ids.emplace(pos.first->second->id);
				list.emplace_back(pos.first->second);
			}
			++pos.first;
		}
	}
	return list;
}

void TmProgramCoursePnrIndex::makeIndex(const vector<std::shared_ptr<TmProgramCoursePnr>>& tmProgramCoursePnrList) {
	_idIndex.clear();
	_programCourseIdIndex.clear();
	for (auto& tmProgramCoursePnr : tmProgramCoursePnrList) {
		if (tmProgramCoursePnr->id !=0 )
			_idIndex.insert(std::make_pair(tmProgramCoursePnr->id, tmProgramCoursePnr));

		if (tmProgramCoursePnr->tmProgramCourseId !=0 )
			_programCourseIdIndex.insert(std::make_pair(tmProgramCoursePnr->tmProgramCourseId, tmProgramCoursePnr));
	}
}

//TmProgramCourseIpckIndex
TmProgramCourseIpckIndex::TmProgramCourseIpckIndex(const vector<std::shared_ptr<TmProgramCourseIpck>>& tmProgramCourseIpckList) {
	makeIndex(tmProgramCourseIpckList);
}

const std::shared_ptr<TmProgramCourseIpck> TmProgramCourseIpckIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmProgramCourseIpck>> TmProgramCourseIpckIndex::getByProgramCourseId(const long long tmProgramCourseId) const {
	vector<std::shared_ptr<TmProgramCourseIpck>> list;
	auto pos = _programCourseIdIndex.equal_range(tmProgramCourseId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourseIpck>> TmProgramCourseIpckIndex::getByProgramCourseIds(const vector<long long> tmProgramCourseIds) const {
	set<long long> ids;
	vector<std::shared_ptr<TmProgramCourseIpck>> list;
	for (auto& tmProgramCourseId : tmProgramCourseIds) {
		auto pos = _programCourseIdIndex.equal_range(tmProgramCourseId);
		while (pos.first != pos.second)
		{
			if (ids.find(pos.first->second->id) == ids.end()) {
				//避免重复插入
				ids.emplace(pos.first->second->id);
				list.emplace_back(pos.first->second);
			}
			++pos.first;
		}
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourseIpck>> TmProgramCourseIpckIndex::getByProgramCoursePnrId(const long long tmProgramCoursePnrId) const {
	vector<std::shared_ptr<TmProgramCourseIpck>> list;
	auto pos = _programCoursePnrIdIndex.equal_range(tmProgramCoursePnrId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmProgramCourseIpckIndex::makeIndex(const vector<std::shared_ptr<TmProgramCourseIpck>>& tmProgramCourseIpckList) {
	_idIndex.clear();
	_programCourseIdIndex.clear();
	_programCoursePnrIdIndex.clear();
	for (auto& tmProgramCourseIpck : tmProgramCourseIpckList) {
		if (tmProgramCourseIpck->id !=0 )
			_idIndex.insert(std::make_pair(tmProgramCourseIpck->id, tmProgramCourseIpck));

		if (tmProgramCourseIpck->tmProgramCourseId != 0)
			_programCourseIdIndex.insert(std::make_pair(tmProgramCourseIpck->tmProgramCourseId, tmProgramCourseIpck));

		if (tmProgramCourseIpck->tmProgramCoursePnrId != 0)
			_programCoursePnrIdIndex.insert(std::make_pair(tmProgramCourseIpck->tmProgramCoursePnrId, tmProgramCourseIpck));
	}
}

//TmProgramCourseMoreIndex
TmProgramCourseMoreIndex::TmProgramCourseMoreIndex(const vector<std::shared_ptr<TmProgramCourseMore>>& tmProgramCourseMoreList) {
	makeIndex(tmProgramCourseMoreList);
}

const std::shared_ptr<TmProgramCourseMore> TmProgramCourseMoreIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmProgramCourseMore>> TmProgramCourseMoreIndex::getByProgramCourseId(const long long tmProgramCourseId) const {
	vector<std::shared_ptr<TmProgramCourseMore>> list;
	auto pos = _programCourseIdIndex.equal_range(tmProgramCourseId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourseMore>> TmProgramCourseMoreIndex::getByProgramCoursePnrId(const long long tmProgramCoursePnrId) const {
	vector<std::shared_ptr<TmProgramCourseMore>> list;
	auto pos = _programCoursePnrIdIndex.equal_range(tmProgramCoursePnrId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmProgramCourseMoreIndex::makeIndex(const vector<std::shared_ptr<TmProgramCourseMore>>& tmProgramCourseMoreList) {
	_idIndex.clear();
	_programCourseIdIndex.clear();
	_programCoursePnrIdIndex.clear();
	for (auto& tmProgramCourseMore : tmProgramCourseMoreList) {
		if (tmProgramCourseMore->id != 0 )
			_idIndex.insert(std::make_pair(tmProgramCourseMore->id, tmProgramCourseMore));

		if (tmProgramCourseMore->tmProgramCourseId != 0)
			_programCourseIdIndex.insert(std::make_pair(tmProgramCourseMore->tmProgramCourseId, tmProgramCourseMore));

		if (tmProgramCourseMore->tmProgramCoursePnrId != 0)
			_programCoursePnrIdIndex.insert(std::make_pair(tmProgramCourseMore->tmProgramCoursePnrId, tmProgramCourseMore));
	}
}

//TmProgramCourseMoreLegIndex
TmProgramCourseMoreLegIndex::TmProgramCourseMoreLegIndex(const vector<std::shared_ptr<TmProgramCourseMoreLeg>>& tmProgramCourseMoreLegList) {
	makeIndex(tmProgramCourseMoreLegList);
}

const std::shared_ptr<TmProgramCourseMoreLeg> TmProgramCourseMoreLegIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmProgramCourseMoreLeg>> TmProgramCourseMoreLegIndex::getByProgramId(const long long programId) const {
	vector<std::shared_ptr<TmProgramCourseMoreLeg>> list;
	auto pos = _programIdIndex.equal_range(programId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourseMoreLeg>> TmProgramCourseMoreLegIndex::getByProgramCourseId(const long long tmProgramCourseId) const {
	vector<std::shared_ptr<TmProgramCourseMoreLeg>> list;
	auto pos = _programCourseIdIndex.equal_range(tmProgramCourseId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourseMoreLeg>> TmProgramCourseMoreLegIndex::getByProgramCoursePnrId(const long long tmProgramCoursePnrId) const {
	vector<std::shared_ptr<TmProgramCourseMoreLeg>> list;
	auto pos = _programCoursePnrIdIndex.equal_range(tmProgramCoursePnrId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmProgramCourseMoreLeg>> TmProgramCourseMoreLegIndex::getByProgramCourseMoreId(const long long tmProgramCourseMoreId) const {
	vector<std::shared_ptr<TmProgramCourseMoreLeg>> list;
	auto pos = _programCourseMoreIdIndex.equal_range(tmProgramCourseMoreId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmProgramCourseMoreLegIndex::makeIndex(const vector<std::shared_ptr<TmProgramCourseMoreLeg>>& tmProgramCourseMoreLegList) {
	_idIndex.clear();
	_programIdIndex.clear();
	_programCourseIdIndex.clear();
	_programCoursePnrIdIndex.clear();
	_programCourseMoreIdIndex.clear();
	for (auto& tmProgramCourseMoreLeg : tmProgramCourseMoreLegList) {
		if (tmProgramCourseMoreLeg->id != 0)
			_idIndex.insert(std::make_pair(tmProgramCourseMoreLeg->id, tmProgramCourseMoreLeg));

		if (tmProgramCourseMoreLeg->programId != 0)
			_programIdIndex.insert(std::make_pair(tmProgramCourseMoreLeg->programId, tmProgramCourseMoreLeg));

		if (tmProgramCourseMoreLeg->tmProgramCourseId != 0)
			_programCourseIdIndex.insert(std::make_pair(tmProgramCourseMoreLeg->tmProgramCourseId, tmProgramCourseMoreLeg));

		if (tmProgramCourseMoreLeg->tmProgramCoursePnrId != 0)
			_programCoursePnrIdIndex.insert(std::make_pair(tmProgramCourseMoreLeg->tmProgramCoursePnrId, tmProgramCourseMoreLeg));

		if (tmProgramCourseMoreLeg->tmProgramCourseMoreId != 0)
			_programCourseMoreIdIndex.insert(std::make_pair(tmProgramCourseMoreLeg->tmProgramCourseMoreId, tmProgramCourseMoreLeg));
	}
}

//TmDeviceTimeIndex
TmDeviceTimeIndex::TmDeviceTimeIndex(const vector<std::shared_ptr<TmDeviceTime>>& tmDeviceTimeList, const CrewDataContext* dbData) : _dbData(dbData){
	makeIndex(tmDeviceTimeList);
}

const std::shared_ptr<TmDeviceTime> TmDeviceTimeIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmDeviceTime>> TmDeviceTimeIndex::getByResourceCode(const string& resourceCode) const {
	vector<std::shared_ptr<TmDeviceTime>> list;
	auto pos = _resourceCodeIndex.equal_range(resourceCode);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const std::shared_ptr<TmDeviceTime> TmDeviceTimeIndex::getByUtcTime(const string& resourceCode, const time_t startTimeUtc, const time_t endTimeUtc) const {
	string key = makeUtcTimeKey(resourceCode, startTimeUtc, endTimeUtc);
	auto iter = _utcTimeIndex.find(key);
	if (iter == _utcTimeIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmDeviceTime>> TmDeviceTimeIndex::getTimeOverlapByUtcTime(const string& resourceCode, const time_t startTimeUtc, const time_t endTimeUtc, const bool isContainEqual) const {
	vector<std::shared_ptr<TmDeviceTime>> list;
	auto pos = _resourceCodeIndex.equal_range(resourceCode);
	while (pos.first != pos.second)
	{
		auto& tmDeviceTime = pos.first->second;
		time_t currStartTimeLoc = tmDeviceTime->startDateLoc + (time_t)tmDeviceTime->startTimeMinutes * 60;
		time_t currEndTimeLoc = tmDeviceTime->endDateLoc + (time_t)tmDeviceTime->endTimeMinutes * 60;
		int offsetTZMinutes = getTimeZoneOffset(tmDeviceTime->resourceCode, currStartTimeLoc);

		time_t currStartTimeUtc = currStartTimeLoc - (time_t)offsetTZMinutes * 60;
		time_t currEndTimeUtc = currEndTimeLoc - (time_t)offsetTZMinutes * 60;

		if (!isContainEqual && currStartTimeUtc == startTimeUtc && currEndTimeUtc == endTimeUtc) {
			++pos.first;
			continue;
		}

		//if (Utility::GetInstancePtr()->isTimeOverlap(currStartTimeUtc, currEndTimeUtc, startTimeUtc, endTimeUtc)) {
		if (!(currEndTimeUtc<=startTimeUtc || currStartTimeUtc>=endTimeUtc)) { //判断时间段是否存在重叠，左开右开(startTimeUtc和currEndTimeUtc，endTimeUtc和currStartTimeUtc相等不算重叠)
			list.emplace_back(pos.first->second);
		}
		++pos.first;
	}
	return list;
}

int TmDeviceTimeIndex::getTimeZoneOffset(const string& resourceCode, const time_t baseUtcTime) const {
	int offsetTZMinutes = 0;
	auto iterDevice = _dbData->tmDeviceMap.find(resourceCode);
	if (iterDevice != _dbData->tmDeviceMap.end()) {
		string base = iterDevice->second->port;
		string depZoneId = _dbData->getAirportZoneId(base);
		offsetTZMinutes = TimezoneUtils::GetTimezoneOffset(baseUtcTime, depZoneId);
	}
	return offsetTZMinutes;
}

string TmDeviceTimeIndex::makeUtcTimeKey(const string& resourceCode, const time_t startTimeUtc, const time_t endTimeUtc) const {
	stringstream ss;
	ss << resourceCode << "|";
	ss << startTimeUtc << "|";
	ss << endTimeUtc;
	return ss.str();
}

string TmDeviceTimeIndex::makeUtcTimeKey(const std::shared_ptr<TmDeviceTime>& tmDeviceTime) const {
	string strStartTimeLoc = tmDeviceTime->startDate + " " + tmDeviceTime->startTime;
	string strEndTimeLoc = tmDeviceTime->endDate + " " + tmDeviceTime->endTime;
	time_t startTimeLoc = utcStrToUtc((char*)strStartTimeLoc.c_str());
	time_t endTimeLoc = utcStrToUtc((char*)strEndTimeLoc.c_str());

	int offsetTZMinutes = getTimeZoneOffset(tmDeviceTime->resourceCode, startTimeLoc);
	return makeUtcTimeKey(tmDeviceTime->resourceCode, startTimeLoc - (time_t)offsetTZMinutes*60 , endTimeLoc - (time_t)offsetTZMinutes * 60);
}

void TmDeviceTimeIndex::makeIndex(const vector<std::shared_ptr<TmDeviceTime>>& tmDeviceTimeList) {
	_idIndex.clear();
	_resourceCodeIndex.clear();
	_utcTimeIndex.clear();
	for (auto& tmDeviceTime : tmDeviceTimeList) {
		if (tmDeviceTime->id != 0)
			_idIndex.insert(std::make_pair(tmDeviceTime->id, tmDeviceTime));
	
		if (!tmDeviceTime->resourceCode.empty() && tmDeviceTime->status != "U_F") {//针对U_F模拟机航班占用时间直接忽略掉
			_resourceCodeIndex.insert(std::make_pair(tmDeviceTime->resourceCode, tmDeviceTime));

			string key = makeUtcTimeKey(tmDeviceTime);
			_utcTimeIndex.insert(std::make_pair(key, tmDeviceTime));
		}
			
	}
}
