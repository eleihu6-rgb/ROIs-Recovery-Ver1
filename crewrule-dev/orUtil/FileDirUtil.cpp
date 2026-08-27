#include "FileDirUtil.h"

#include <cstdio>
#include <filesystem>
namespace fs = std::filesystem;

#ifdef _WIN32
    #include <Windows.h>
    #define getpid() GetCurrentProcessId()
#else
    #include <unistd.h>
#endif

#include "rapidjson/document.h"
#include "rapidjson/filestream.h"

using namespace std;
using namespace rapidjson;

vector<string> get_all_files_names_within_folder(string folder)
{
	vector<string> names;
	for (auto& entry : fs::directory_iterator(folder)) {
		if (fs::is_regular_file(entry.path())) {
			names.push_back(entry.path().filename().string());
		}
	}
	return names;
}


vector<string> get_all_dir_names_within_folder(string folder)
{
	vector<string> names;
	for (auto& entry : fs::directory_iterator(folder)) {
		if (fs::is_directory(entry.path())) {
			names.push_back(entry.path().filename().string());
		}
	}
	return names;
}

long long read_id_from_json_load_scenario(string filename) {
	// ...
	FILE* fp = fopen(filename.c_str(), "rb"); // non-Windows use "r"
	FileStream is(fp);
	Document document;
	document.ParseStream<0>(is);
	fclose(fp);

	if (!document.HasMember("scenarioId")
		|| !document["scenarioId"].IsInt64()) {
		return -1;
	}
	long long scenarioId = document["scenarioId"].GetInt64();
	return scenarioId;
}

void printProcessIdFile() {
	int pid = getpid();
	FILE * fp = fopen("OrProcessID.txt", "w");
	fprintf(fp, "%d", pid);
	fclose(fp);
}

void printEndRunFile(double elapsedTime)
{
	FILE * fp = fopen("EndOfRun.txt", "w");
	fprintf(fp, "RO Run Time = %f seconds \n", elapsedTime);
	fprintf(fp, "This file indicates the end of OR engine run.");
	fclose(fp);
}
