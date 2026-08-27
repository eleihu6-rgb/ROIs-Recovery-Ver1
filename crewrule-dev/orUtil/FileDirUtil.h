#ifndef UTIL_H
#define UTIL_H

#include <vector>
#include <string>

std::vector<std::string> get_all_files_names_within_folder(std::string folder);
std::vector<std::string> get_all_dir_names_within_folder(std::string folder);

long long read_id_from_json_load_scenario(std::string filename);

void printProcessIdFile();

void printEndRunFile(double elapsedTime);

#endif//UTIL_H