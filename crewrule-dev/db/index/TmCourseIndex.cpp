#include <stdio.h>
#include <vector>
#include <algorithm>

#include <limits.h>

#include <iostream>
#include <time.h>
#include "UtilFunc.h"
#include "TmCourseIndex.h"
#include "Log/Logger.h"

//TmCourseBriefIndex
TmCourseBriefIndex::TmCourseBriefIndex(const vector<std::shared_ptr<TmCourseBrief>>& tmCourseBriefList) {
	makeIndex(tmCourseBriefList);
}

const std::shared_ptr<TmCourseBrief> TmCourseBriefIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmCourseBrief>> TmCourseBriefIndex::getByCourseId(const long long courseId) const {
	vector<std::shared_ptr<TmCourseBrief>> list;
	auto pos = _courseIdIndex.equal_range(courseId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const std::tuple<int, int> TmCourseBriefIndex::getCourseBriefAndDebrief(const long long courseId, const string& role) const {
	int briefMinutes = -1, debriefMinutes = -1;
	auto tmCourseBriefList = this->getByCourseId(courseId);
	for (auto& tmCourseBrief : tmCourseBriefList) {
		if (std::find(tmCourseBrief->briefRoles.begin(), tmCourseBrief->briefRoles.end(), role) != tmCourseBrief->briefRoles.end()) {
			if (tmCourseBrief->briefType == 1) {
				briefMinutes = tmCourseBrief->briefTimes;
			}
			else if (tmCourseBrief->briefType == 2) {
				debriefMinutes = tmCourseBrief->briefTimes;
			}
		}
	}
	return std::make_tuple(briefMinutes, debriefMinutes);
}

void TmCourseBriefIndex::makeIndex(const vector<std::shared_ptr<TmCourseBrief>>& tmCourseBriefList) {
	_idIndex.clear();
	_courseIdIndex.clear();
	for (auto& tmCourseBrief : tmCourseBriefList) {
		if (tmCourseBrief->id != 0)
			_idIndex.insert(std::make_pair(tmCourseBrief->id, tmCourseBrief));

		if (tmCourseBrief->courseId != 0)
			_courseIdIndex.insert(std::make_pair(tmCourseBrief->courseId, tmCourseBrief));
	}
}

//TmCourseDurationIndex
TmCourseDurationIndex::TmCourseDurationIndex(const vector<std::shared_ptr<TmCourseDuration>>& tmCourseDurationList) {
	makeIndex(tmCourseDurationList);
}

const std::shared_ptr<TmCourseDuration> TmCourseDurationIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmCourseDuration>> TmCourseDurationIndex::getByCourseId(const long long courseId) const {
	vector<std::shared_ptr<TmCourseDuration>> list;
	auto pos = _courseIdIndex.equal_range(courseId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmCourseDurationIndex::makeIndex(const vector<std::shared_ptr<TmCourseDuration>>& tmCourseDurationList) {
	_idIndex.clear();
	_courseIdIndex.clear();
	for (auto& tmCourseDuration : tmCourseDurationList) {
		if (tmCourseDuration->id != 0)
			_idIndex.insert(std::make_pair(tmCourseDuration->id, tmCourseDuration));

		if (tmCourseDuration->courseId != 0)
			_courseIdIndex.insert(std::make_pair(tmCourseDuration->courseId, tmCourseDuration));
	}
}

//TmCourseRoleIndex
TmCourseRoleIndex::TmCourseRoleIndex(const vector<std::shared_ptr<TmCourseRole>>& tmCourseRoleList) {
	makeIndex(tmCourseRoleList);
}

const std::shared_ptr<TmCourseRole> TmCourseRoleIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmCourseRole>> TmCourseRoleIndex::getByCourseId(const long long courseId) const {
	vector<std::shared_ptr<TmCourseRole>> list;
	auto pos = _courseIdIndex.equal_range(courseId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmCourseRoleIndex::makeIndex(const vector<std::shared_ptr<TmCourseRole>>& tmCourseRoleList) {
	_idIndex.clear();
	_courseIdIndex.clear();
	for (auto& tmCourseRole : tmCourseRoleList) {
		if (tmCourseRole->id !=0 )
			_idIndex.insert(std::make_pair(tmCourseRole->id, tmCourseRole));

		if (tmCourseRole->courseId !=0)
			_courseIdIndex.insert(std::make_pair(tmCourseRole->courseId, tmCourseRole));
	}
}

//TmCourseRoleBaseIndex
TmCourseRoleBaseIndex::TmCourseRoleBaseIndex(const vector<std::shared_ptr<TmCourseRoleBase>>& tmCourseRoleBaseList) {
	makeIndex(tmCourseRoleBaseList);
}

const std::shared_ptr<TmCourseRoleBase> TmCourseRoleBaseIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmCourseRoleBase>> TmCourseRoleBaseIndex::getByCourseRoleId(const long long tmCourseRoleId) const {
	vector<std::shared_ptr<TmCourseRoleBase>> list;
	auto pos = _courseRoleIdIndex.equal_range(tmCourseRoleId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmCourseRoleBaseIndex::makeIndex(const vector<std::shared_ptr<TmCourseRoleBase>>& tmCourseRoleBaseList) {
	_idIndex.clear();
	_courseRoleIdIndex.clear();
	for (auto& tmCourseRoleBase : tmCourseRoleBaseList) {
		if (tmCourseRoleBase->id != 0)
			_idIndex.insert(std::make_pair(tmCourseRoleBase->id, tmCourseRoleBase));

		if (tmCourseRoleBase->tmCourseRoleId != 0)
			_courseRoleIdIndex.insert(std::make_pair(tmCourseRoleBase->tmCourseRoleId, tmCourseRoleBase));
	}
}

//TmCourseRoleQualIndex
TmCourseRoleQualIndex::TmCourseRoleQualIndex(const vector<std::shared_ptr<TmCourseRoleQual>>& tmCourseRoleQualList) {
	makeIndex(tmCourseRoleQualList);
}

const std::shared_ptr<TmCourseRoleQual> TmCourseRoleQualIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmCourseRoleQual>> TmCourseRoleQualIndex::getByCourseRoleId(const long long tmCourseRoleId) const {
	vector<std::shared_ptr<TmCourseRoleQual>> list;
	auto pos = _courseRoleIdIndex.equal_range(tmCourseRoleId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmCourseRoleQual>> TmCourseRoleQualIndex::getByCourseRoleBaseId(const long long tmCourseRoleBaseId) const {
	vector<std::shared_ptr<TmCourseRoleQual>> list;
	auto pos = _courseRoleBaseIdIndex.equal_range(tmCourseRoleBaseId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmCourseRoleQualIndex::makeIndex(const vector<std::shared_ptr<TmCourseRoleQual>>& tmCourseRoleQualList) {
	_idIndex.clear();
	_courseRoleIdIndex.clear();
	_courseRoleBaseIdIndex.clear();
	for (auto& tmCourseRoleQual : tmCourseRoleQualList) {
		if (tmCourseRoleQual->id != 0)
			_idIndex.insert(std::make_pair(tmCourseRoleQual->id, tmCourseRoleQual));

		if (tmCourseRoleQual->tmCourseRoleId != 0)
			_courseRoleIdIndex.insert(std::make_pair(tmCourseRoleQual->tmCourseRoleId, tmCourseRoleQual));

		if (tmCourseRoleQual->tmCourseRoleBaseId != 0)
			_courseRoleBaseIdIndex.insert(std::make_pair(tmCourseRoleQual->tmCourseRoleBaseId, tmCourseRoleQual));
	}
}

//TmCourseRoleDeviceIndex
TmCourseRoleDeviceIndex::TmCourseRoleDeviceIndex(const vector<std::shared_ptr<TmCourseRoleDevice>>& tmCourseRoleDeviceList) {
	makeIndex(tmCourseRoleDeviceList);
}

const std::shared_ptr<TmCourseRoleDevice> TmCourseRoleDeviceIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmCourseRoleDevice>> TmCourseRoleDeviceIndex::getByCourseRoleId(const long long tmCourseRoleId) const {
	vector<std::shared_ptr<TmCourseRoleDevice>> list;
	auto pos = _courseRoleIdIndex.equal_range(tmCourseRoleId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmCourseRoleDevice>> TmCourseRoleDeviceIndex::getByCourseRoleBaseId(const long long tmCourseRoleBaseId) const {
	vector<std::shared_ptr<TmCourseRoleDevice>> list;
	auto pos = _courseRoleBaseIdIndex.equal_range(tmCourseRoleBaseId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmCourseRoleDeviceIndex::makeIndex(const vector<std::shared_ptr<TmCourseRoleDevice>>& tmCourseRoleDeviceList) {
	_idIndex.clear();
	_courseRoleIdIndex.clear();
	_courseRoleBaseIdIndex.clear();
	for (auto& tmCourseRoleDevice : tmCourseRoleDeviceList) {
		if (tmCourseRoleDevice->id != 0)
			_idIndex.insert(std::make_pair(tmCourseRoleDevice->id, tmCourseRoleDevice));

		if (tmCourseRoleDevice->tmCourseRoleId != 0)
			_courseRoleIdIndex.insert(std::make_pair(tmCourseRoleDevice->tmCourseRoleId, tmCourseRoleDevice));

		if (tmCourseRoleDevice->tmCourseRoleBaseId != 0)
			_courseRoleBaseIdIndex.insert(std::make_pair(tmCourseRoleDevice->tmCourseRoleBaseId, tmCourseRoleDevice));
	}
}


