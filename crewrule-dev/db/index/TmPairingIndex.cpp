#include <stdio.h>
#include <vector>
#include <algorithm>

#include <limits.h>

#include <iostream>
#include <time.h>
#include "UtilFunc.h"
#include "TimezoneUtils.h"
#include "TmPairingIndex.h"
#include "Log/Logger.h"

//TmPairingChartIndex
TmPairingChartIndex::TmPairingChartIndex(const vector<std::shared_ptr<TmPairingChart>>& tmPairingChartList) {
	makeIndex(tmPairingChartList);
}

const std::shared_ptr<TmPairingChart> TmPairingChartIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const std::shared_ptr<TmPairingChart> TmPairingChartIndex::getByProgramStartTime(const time_t programStartTime) const {
	for (auto& pair : _idIndex) {
		if (programStartTime >= pair.second->effDt && programStartTime < pair.second->expDt) {
			return pair.second;
		}
	}
	return nullptr;
}

void TmPairingChartIndex::makeIndex(const vector<std::shared_ptr<TmPairingChart>>& tmPairingChartList) {
	_idIndex.clear();
	for (auto& tmPairingChart : tmPairingChartList) {
		if (tmPairingChart->id != 0)
			_idIndex.insert(std::make_pair(tmPairingChart->id, tmPairingChart));

	}
}

//TmPairingChartRoleIndex
TmPairingChartRoleIndex::TmPairingChartRoleIndex(const vector<std::shared_ptr<TmPairingChartRole>>& tmPairingChartRoleList) {
	makeIndex(tmPairingChartRoleList);
}

const std::shared_ptr<TmPairingChartRole> TmPairingChartRoleIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmPairingChartRole>> TmPairingChartRoleIndex::getByPairingChartId(const long long pairingChartId) const {
	vector<std::shared_ptr<TmPairingChartRole>> list;
	auto pos = _pairingChartIdIndex.equal_range(pairingChartId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmPairingChartRoleIndex::makeIndex(const vector<std::shared_ptr<TmPairingChartRole>>& tmPairingChartRoleList) {
	_idIndex.clear();
	_pairingChartIdIndex.clear();
	for (auto& tmPairingChartRole : tmPairingChartRoleList) {
		if (tmPairingChartRole->id != 0)
			_idIndex.insert(std::make_pair(tmPairingChartRole->id, tmPairingChartRole));

		if (tmPairingChartRole->pairingChartId != 0)
			_pairingChartIdIndex.insert(std::make_pair(tmPairingChartRole->pairingChartId, tmPairingChartRole));
	}
}

//TmPairingChartRoleQualIndex
TmPairingChartRoleQualIndex::TmPairingChartRoleQualIndex(const vector<std::shared_ptr<TmPairingChartRoleQual>>& tmPairingChartRoleQualList) {
	makeIndex(tmPairingChartRoleQualList);
}

const std::shared_ptr<TmPairingChartRoleQual> TmPairingChartRoleQualIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmPairingChartRoleQual>> TmPairingChartRoleQualIndex::getByPairingChartId(const long long pairingChartId) const {
	vector<std::shared_ptr<TmPairingChartRoleQual>> list;
	auto pos = _pairingChartIdIndex.equal_range(pairingChartId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmPairingChartRoleQual>> TmPairingChartRoleQualIndex::getByPairingChartRoleId(const long long pairingChartRoleId) const {
	vector<std::shared_ptr<TmPairingChartRoleQual>> list;
	auto pos = _pairingChartRoleIdIndex.equal_range(pairingChartRoleId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmPairingChartRoleQualIndex::makeIndex(const vector<std::shared_ptr<TmPairingChartRoleQual>>& tmPairingChartRoleQualList) {
	_idIndex.clear();
	_pairingChartIdIndex.clear();
	_pairingChartRoleIdIndex.clear();
	for (auto& tmPairingChartRoleQual : tmPairingChartRoleQualList) {
		if (tmPairingChartRoleQual->id != 0)
			_idIndex.insert(std::make_pair(tmPairingChartRoleQual->id, tmPairingChartRoleQual));

		if (tmPairingChartRoleQual->pairingChartId != 0)
			_pairingChartIdIndex.insert(std::make_pair(tmPairingChartRoleQual->pairingChartId, tmPairingChartRoleQual));

		if (tmPairingChartRoleQual->pairingChartRoleId != 0)
			_pairingChartRoleIdIndex.insert(std::make_pair(tmPairingChartRoleQual->pairingChartRoleId, tmPairingChartRoleQual));
	}
}

//TmPairingChartCourseIndex
TmPairingChartCourseIndex::TmPairingChartCourseIndex(const vector<std::shared_ptr<TmPairingChartCourse>>& tmPairingChartCourseList) {
	makeIndex(tmPairingChartCourseList);
}

const std::shared_ptr<TmPairingChartCourse> TmPairingChartCourseIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmPairingChartCourse>> TmPairingChartCourseIndex::getByPairingChartId(const long long pairingChartId) const {
	vector<std::shared_ptr<TmPairingChartCourse>> list;
	auto pos = _pairingChartIdIndex.equal_range(pairingChartId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmPairingChartCourse>> TmPairingChartCourseIndex::getByCourseId(const long long courseId) const {
	vector<std::shared_ptr<TmPairingChartCourse>> list;
	auto pos = _courseIdIndex.equal_range(courseId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmPairingChartCourseIndex::makeIndex(const vector<std::shared_ptr<TmPairingChartCourse>>& tmPairingChartCourseList) {
	_idIndex.clear();
	_pairingChartIdIndex.clear();
	_courseIdIndex.clear();
	for (auto& tmPairingChartCourse : tmPairingChartCourseList) {
		if (tmPairingChartCourse->id != 0)
			_idIndex.insert(std::make_pair(tmPairingChartCourse->id, tmPairingChartCourse));

		if (tmPairingChartCourse->pairingChartId != 0)
			_pairingChartIdIndex.insert(std::make_pair(tmPairingChartCourse->pairingChartId, tmPairingChartCourse));

		if (tmPairingChartCourse->courseId != 0)
			_courseIdIndex.insert(std::make_pair(tmPairingChartCourse->courseId, tmPairingChartCourse));
	}
}

