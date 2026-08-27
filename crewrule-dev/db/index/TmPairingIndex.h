#pragma once

#include "CrewDB.h"

class TmPairingChartIndex {
public:
	TmPairingChartIndex(const vector<std::shared_ptr<TmPairingChart>>& tmPairingChartList);

	const std::shared_ptr<TmPairingChart> getById(const long long id) const;

	const std::shared_ptr<TmPairingChart> getByProgramStartTime(const time_t programStartTime) const;

private:
	map<long long, std::shared_ptr<TmPairingChart>> _idIndex; //<id, TmPairingChart>

	void makeIndex(const vector<std::shared_ptr<TmPairingChart>>& tmPairingChartList);
};

class TmPairingChartRoleIndex {
public:
	TmPairingChartRoleIndex(const vector<std::shared_ptr<TmPairingChartRole>>& tmPairingChartRoleList);

	const std::shared_ptr<TmPairingChartRole> getById(const long long id) const;

	const vector<std::shared_ptr<TmPairingChartRole>> getByPairingChartId(const long long pairingChartId) const;

private:
	map<long long, std::shared_ptr<TmPairingChartRole>> _idIndex; //<id, TmPairingChartRole>

	unordered_multimap<long long, std::shared_ptr<TmPairingChartRole>> _pairingChartIdIndex; //<pairingChartId, TmPairingChartRole>

	void makeIndex(const vector<std::shared_ptr<TmPairingChartRole>>& tmPairingChartRoleList);
};

class TmPairingChartRoleQualIndex {
public:
	TmPairingChartRoleQualIndex(const vector<std::shared_ptr<TmPairingChartRoleQual>>& tmPairingChartRoleQualList);

	const std::shared_ptr<TmPairingChartRoleQual> getById(const long long id) const;

	const vector<std::shared_ptr<TmPairingChartRoleQual>> getByPairingChartId(const long long pairingChartId) const;

	const vector<std::shared_ptr<TmPairingChartRoleQual>> getByPairingChartRoleId(const long long pairingChartRoleId) const;

private:
	map<long long, std::shared_ptr<TmPairingChartRoleQual>> _idIndex; //<id, TmPairingChartRoleQual>
	unordered_multimap<long long, std::shared_ptr<TmPairingChartRoleQual>> _pairingChartIdIndex; //<pairingChartId, TmPairingChartRoleQual>
	unordered_multimap<long long, std::shared_ptr<TmPairingChartRoleQual>> _pairingChartRoleIdIndex; //<pairingChartRoleId, TmPairingChartRoleQual>

	void makeIndex(const vector<std::shared_ptr<TmPairingChartRoleQual>>& tmPairingChartRoleQualList);
};

class TmPairingChartCourseIndex {
public:
	TmPairingChartCourseIndex(const vector<std::shared_ptr<TmPairingChartCourse>>& tmPairingChartCourseList);

	const std::shared_ptr<TmPairingChartCourse> getById(const long long id) const;

	const vector<std::shared_ptr<TmPairingChartCourse>> getByPairingChartId(const long long pairingChartId) const;

	const vector<std::shared_ptr<TmPairingChartCourse>> getByCourseId(const long long courseId) const;
	
private:
	map<long long, std::shared_ptr<TmPairingChartCourse>> _idIndex; //<id, TmPairingChartCourse>
	unordered_multimap<long long, std::shared_ptr<TmPairingChartCourse>> _pairingChartIdIndex; //<pairingChartId, TmPairingChartCourse>
	unordered_multimap<long long, std::shared_ptr<TmPairingChartCourse>> _courseIdIndex; //<courseId, TmPairingChartCourse>

	void makeIndex(const vector<std::shared_ptr<TmPairingChartCourse>>& tmPairingChartCourseList);
};