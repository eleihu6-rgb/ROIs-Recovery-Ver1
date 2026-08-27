#include <stdio.h>
#include <vector>
#include <algorithm>

#include <limits.h>

#include <iostream>
#include <time.h>
#include "UtilFunc.h"
#include "TmFootprintIndex.h"
#include "Log/Logger.h"

//TmFootprintIndex
TmFootprintIndex::TmFootprintIndex(const vector<std::shared_ptr<TmFootprint>>& tmFootprintList) {
	makeIndex(tmFootprintList);
}

const std::shared_ptr<TmFootprint> TmFootprintIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmFootprint>> TmFootprintIndex::getChildrenByParentId(const long long parentId) const {
	vector<std::shared_ptr<TmFootprint>> list;
	auto pos = _parentIdIndex.equal_range(parentId);
	while (pos.first != pos.second)
	{
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmFootprintIndex::makeIndex(const vector<std::shared_ptr<TmFootprint>>& tmFootprintList) {
	_idIndex.clear();
	_parentIdIndex.clear();
	for (auto& tmFootprint : tmFootprintList) {
		if (tmFootprint->id != 0)
			_idIndex.insert(std::make_pair(tmFootprint->id, tmFootprint));

		if (tmFootprint->parentId != 0)
			_parentIdIndex.insert(std::make_pair(tmFootprint->parentId, tmFootprint));
	}
}

//TmFootprintCourseIndex
TmFootprintCourseIndex::TmFootprintCourseIndex(const vector<std::shared_ptr<TmFootprintCourse>>& tmFootprintCourseList) {
	makeIndex(tmFootprintCourseList);
}

const std::shared_ptr<TmFootprintCourse> TmFootprintCourseIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

void TmFootprintCourseIndex::makeIndex(const vector<std::shared_ptr<TmFootprintCourse>>& tmFootprintCourseList) {
	_idIndex.clear();
	for (auto& tmFootprintCourse : tmFootprintCourseList) {
		if (tmFootprintCourse->id != 0)
			_idIndex.insert(std::make_pair(tmFootprintCourse->id, tmFootprintCourse));

	}
}

//TmFootprintCourseTraineeIndex
TmFootprintCourseTraineeIndex::TmFootprintCourseTraineeIndex(const vector<std::shared_ptr<TmFootprintCourseTrainee>>& tmFootprintCourseTraineeList) {
	makeIndex(tmFootprintCourseTraineeList);
}

const std::shared_ptr<TmFootprintCourseTrainee> TmFootprintCourseTraineeIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmFootprintCourseTrainee>> TmFootprintCourseTraineeIndex::getByFootprintCourseId(const long long footprintCourseId) const {
	vector<std::shared_ptr<TmFootprintCourseTrainee>> list;
	auto pos = _footprintCourseIdIndex.equal_range(footprintCourseId);
	while (pos.first != pos.second) {
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmFootprintCourseTraineeIndex::makeIndex(const vector<std::shared_ptr<TmFootprintCourseTrainee>>& tmFootprintCourseTraineeList) {
	_idIndex.clear();
	_footprintCourseIdIndex.clear();
	for (auto& tmFootprintCourseTrainee : tmFootprintCourseTraineeList) {
		if (tmFootprintCourseTrainee->id != 0)
			_idIndex.insert(std::make_pair(tmFootprintCourseTrainee->id, tmFootprintCourseTrainee));

		if (tmFootprintCourseTrainee->footprintCourseId != 0)
			_footprintCourseIdIndex.insert(std::make_pair(tmFootprintCourseTrainee->footprintCourseId, tmFootprintCourseTrainee));
	}
}

// TmFootprintCourseSectorIndex

TmFootprintCourseSectorIndex::TmFootprintCourseSectorIndex(const vector<std::shared_ptr<TmFootprintCourseSector>>& tmFootprintCourseSectorList) {
	makeIndex(tmFootprintCourseSectorList);
}
const std::shared_ptr<TmFootprintCourseSector> TmFootprintCourseSectorIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}
void TmFootprintCourseSectorIndex::makeIndex(const vector<std::shared_ptr<TmFootprintCourseSector> > &tmFootprintCourseSectorList) {
	_idIndex.clear();
	for (auto& tmFootprintCourseSector : tmFootprintCourseSectorList) {
		if (tmFootprintCourseSector->id != 0)
			_idIndex.insert(std::make_pair(tmFootprintCourseSector->id, tmFootprintCourseSector));
	}
}

//TmFootprintCourseIpRoleIndex
TmFootprintCourseIpRoleIndex::TmFootprintCourseIpRoleIndex(const vector<std::shared_ptr<TmFootprintCourseIpRole>>& tmFootprintCourseIpRoleList) {
	makeIndex(tmFootprintCourseIpRoleList);
}

const std::shared_ptr<TmFootprintCourseIpRole> TmFootprintCourseIpRoleIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmFootprintCourseIpRole>> TmFootprintCourseIpRoleIndex::getByFootprintCourseId(const long long footprintCourseId) const {
	vector<std::shared_ptr<TmFootprintCourseIpRole>> list;
	auto pos = _footprintCourseIdIndex.equal_range(footprintCourseId);
	while (pos.first != pos.second) {
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

const vector<std::shared_ptr<TmFootprintCourseIpRole>> TmFootprintCourseIpRoleIndex::getByFootprintTraineeId(const long long footprintTraineeId) const {
	vector<std::shared_ptr<TmFootprintCourseIpRole>> list;
	auto pos = _footprintTraineeIdIndex.equal_range(footprintTraineeId);
	while (pos.first != pos.second) {
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmFootprintCourseIpRoleIndex::makeIndex(const vector<std::shared_ptr<TmFootprintCourseIpRole>>& tmFootprintCourseIpRoleList) {
	_idIndex.clear();
	_footprintCourseIdIndex.clear();
	_footprintTraineeIdIndex.clear();
	for (auto& tmFootprintCourseIpRole : tmFootprintCourseIpRoleList) {
		if (tmFootprintCourseIpRole->id != 0)
			_idIndex.insert(std::make_pair(tmFootprintCourseIpRole->id, tmFootprintCourseIpRole));

		if (tmFootprintCourseIpRole->footprintCourseId != 0)
			_footprintCourseIdIndex.insert(std::make_pair(tmFootprintCourseIpRole->footprintCourseId, tmFootprintCourseIpRole));

		if (tmFootprintCourseIpRole->footprintTraineeId != 0)
			_footprintTraineeIdIndex.insert(std::make_pair(tmFootprintCourseIpRole->footprintTraineeId, tmFootprintCourseIpRole));
	}
}

//TmFootprintCourseIpRoleBaseIndex
TmFootprintCourseIpRoleBaseIndex::TmFootprintCourseIpRoleBaseIndex(const vector<std::shared_ptr<TmFootprintCourseIpRoleBase>>& tmFootprintCourseIpRoleBaseList) {
	makeIndex(tmFootprintCourseIpRoleBaseList);
}

const std::shared_ptr<TmFootprintCourseIpRoleBase> TmFootprintCourseIpRoleBaseIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmFootprintCourseIpRoleBase>> TmFootprintCourseIpRoleBaseIndex::getByFootprintCourseIpRoleId(const long long footprintCourseIpRoleId) const {
	vector<std::shared_ptr<TmFootprintCourseIpRoleBase>> list;
	auto pos = _footprintCourseIpRoleIdIndex.equal_range(footprintCourseIpRoleId);
	while (pos.first != pos.second) {
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmFootprintCourseIpRoleBaseIndex::makeIndex(const vector<std::shared_ptr<TmFootprintCourseIpRoleBase>>& tmFootprintCourseIpRoleBaseList) {
	_idIndex.clear();
	_footprintCourseIpRoleIdIndex.clear();
	for (auto& tmFootprintCourseIpRoleBase : tmFootprintCourseIpRoleBaseList) {
		if (tmFootprintCourseIpRoleBase->id != 0)
			_idIndex.insert(std::make_pair(tmFootprintCourseIpRoleBase->id, tmFootprintCourseIpRoleBase));

		if (tmFootprintCourseIpRoleBase->footprintCourseIpRoleId != 0)
			_footprintCourseIpRoleIdIndex.insert(std::make_pair(tmFootprintCourseIpRoleBase->footprintCourseIpRoleId, tmFootprintCourseIpRoleBase));
	}
}

//TmFootprintCourseIpRoleQualIndex
TmFootprintCourseIpRoleQualIndex::TmFootprintCourseIpRoleQualIndex(const vector<std::shared_ptr<TmFootprintCourseIpRoleQual>>& tmFootprintCourseIpRoleQualList) {
	makeIndex(tmFootprintCourseIpRoleQualList);
}

const std::shared_ptr<TmFootprintCourseIpRoleQual> TmFootprintCourseIpRoleQualIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmFootprintCourseIpRoleQual>> TmFootprintCourseIpRoleQualIndex::getByFootprintCourseIpRoleBaseId(const long long footprintCourseIpRoleBaseId) const {
	vector<std::shared_ptr<TmFootprintCourseIpRoleQual>> list;
	auto pos = _footprintCourseIpRoleBaseIdIndex.equal_range(footprintCourseIpRoleBaseId);
	while (pos.first != pos.second) {
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmFootprintCourseIpRoleQualIndex::makeIndex(const vector<std::shared_ptr<TmFootprintCourseIpRoleQual>>& tmFootprintCourseIpRoleQualList) {
	_idIndex.clear();
	_footprintCourseIpRoleBaseIdIndex.clear();
	for (auto& tmFootprintCourseIpRoleQual : tmFootprintCourseIpRoleQualList) {
		if (tmFootprintCourseIpRoleQual->id != 0)
			_idIndex.insert(std::make_pair(tmFootprintCourseIpRoleQual->id, tmFootprintCourseIpRoleQual));

		if (tmFootprintCourseIpRoleQual->footprintCourseIpRoleBaseId != 0)
			_footprintCourseIpRoleBaseIdIndex.insert(std::make_pair(tmFootprintCourseIpRoleQual->footprintCourseIpRoleBaseId, tmFootprintCourseIpRoleQual));
	}
}

//TmFootprintCourseRoleIndex
TmFootprintCourseRoleIndex::TmFootprintCourseRoleIndex(const vector<std::shared_ptr<TmFootprintCourseRole>>& tmFootprintCourseRoleList) {
	makeIndex(tmFootprintCourseRoleList);
}

const std::shared_ptr<TmFootprintCourseRole> TmFootprintCourseRoleIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

void TmFootprintCourseRoleIndex::makeIndex(const vector<std::shared_ptr<TmFootprintCourseRole>>& tmFootprintCourseRoleList) {
	_idIndex.clear();
	for (auto& tmFootprintCourseRole : tmFootprintCourseRoleList) {
		if (tmFootprintCourseRole->id != 0)
			_idIndex.insert(std::make_pair(tmFootprintCourseRole->id, tmFootprintCourseRole));

	}
}

//TmFootprintCourseRoleQualIndex
TmFootprintCourseRoleQualIndex::TmFootprintCourseRoleQualIndex(const vector<std::shared_ptr<TmFootprintCourseRoleQual>>& tmFootprintCourseRoleQualList) {
	makeIndex(tmFootprintCourseRoleQualList);
}

const std::shared_ptr<TmFootprintCourseRoleQual> TmFootprintCourseRoleQualIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

const vector<std::shared_ptr<TmFootprintCourseRoleQual>> TmFootprintCourseRoleQualIndex::getByFootprintCourseRoleId(const long long footprintCourseRoleId) const {
	vector<std::shared_ptr<TmFootprintCourseRoleQual>> list;
	auto pos = _footprintCourseRoleIdIndex.equal_range(footprintCourseRoleId);
	while (pos.first != pos.second) {
		list.emplace_back(pos.first->second);
		++pos.first;
	}
	return list;
}

void TmFootprintCourseRoleQualIndex::makeIndex(const vector<std::shared_ptr<TmFootprintCourseRoleQual>>& tmFootprintCourseRoleQualList) {
	_idIndex.clear();
	_footprintCourseRoleIdIndex.clear();
	for (auto& tmFootprintCourseRoleQual : tmFootprintCourseRoleQualList) {
		if (tmFootprintCourseRoleQual->id != 0)
			_idIndex.insert(std::make_pair(tmFootprintCourseRoleQual->id, tmFootprintCourseRoleQual));

		if (tmFootprintCourseRoleQual->footprintCourseRoleId != 0)
			_footprintCourseRoleIdIndex.insert(std::make_pair(tmFootprintCourseRoleQual->footprintCourseRoleId, tmFootprintCourseRoleQual));
	}
}


//TmFootprintCourseRoleLimitationIndex
TmFootprintCourseRoleLimitationIndex::TmFootprintCourseRoleLimitationIndex(const vector<std::shared_ptr<TmFootprintCourseRoleLimitation>>& tmFootprintCourseRoleLimitationList) {
	makeIndex(tmFootprintCourseRoleLimitationList);
}

const std::shared_ptr<TmFootprintCourseRoleLimitation> TmFootprintCourseRoleLimitationIndex::getById(const long long id) const {
	auto iter = _idIndex.find(id);
	if (iter == _idIndex.end()) {
		return nullptr;
	}
	return iter->second;
}

void TmFootprintCourseRoleLimitationIndex::makeIndex(const vector<std::shared_ptr<TmFootprintCourseRoleLimitation>>& tmFootprintCourseRoleLimitationList) {
	_idIndex.clear();
	for (auto& tmFootprintCourseRoleLimitation : tmFootprintCourseRoleLimitationList) {
		if (tmFootprintCourseRoleLimitation->id != 0)
			_idIndex.insert(std::make_pair(tmFootprintCourseRoleLimitation->id, tmFootprintCourseRoleLimitation));

	}
}